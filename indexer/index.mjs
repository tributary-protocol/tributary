import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { withRateLimitBackoff } from "./rpc-backoff.mjs";
import { isCaughtUp } from "./cursor.mjs";

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_CONTRACT_ID =
  "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU";
const DEFAULT_LOG_LEVEL = "info";

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function validateConfig(env = process.env) {
  const errors = [];
  const RPC_URL = (env.RPC_URL ?? DEFAULT_RPC_URL).trim();
  const CONTRACT_ID = (env.CONTRACT_ID ?? DEFAULT_CONTRACT_ID).trim();
  const LOG_LEVEL = (env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL).trim().toLowerCase();

  if (!RPC_URL) errors.push("RPC_URL is required");
  if (!CONTRACT_ID) errors.push("CONTRACT_ID is required");
  if (!(LOG_LEVEL in LOG_LEVELS)) {
    errors.push(
      `LOG_LEVEL must be one of: ${Object.keys(LOG_LEVELS).join(", ")}`
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Invalid indexer configuration:\n- ${errors.join("\n- ")}`,
    };
  }

  return { ok: true, value: { RPC_URL, CONTRACT_ID, LOG_LEVEL } };
}

function shouldLog(currentLevel, targetLevel) {
  const currentRank = LOG_LEVELS[currentLevel?.toLowerCase()] ?? LOG_LEVELS.info;
  const targetRank = LOG_LEVELS[targetLevel?.toLowerCase()] ?? LOG_LEVELS.info;
  return targetRank >= currentRank;
}

function formatLogEntry(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

function cursorLedger(cursor) {
  if (!cursor || typeof cursor !== "string" || !cursor.includes("-")) return null;
  try {
    return Number(BigInt(cursor.split("-")[0]) >> 32n);
  } catch {
    return null;
  }
}

function calculateScanLag(latestLedger, cursor) {
  if (typeof latestLedger !== "number" || latestLedger <= 0) return null;
  const cLedger = typeof cursor === "number" ? cursor : cursorLedger(cursor);
  if (cLedger === null || typeof cLedger !== "number" || cLedger <= 0) return null;
  return Math.max(0, latestLedger - cLedger);
}

function createMetricsTracker() {
  const metrics = {
    eventsIndexedTotal: 0,
    eventsIndexedLastPoll: 0,
    scanLagLedgers: null,
    errorsTotal: 0,
  };

  return {
    getMetrics: () => ({ ...metrics }),
    recordPollSuccess: ({ eventsIndexed, scanLagLedgers }) => {
      metrics.eventsIndexedLastPoll = eventsIndexed;
      metrics.eventsIndexedTotal += eventsIndexed;
      metrics.scanLagLedgers = scanLagLedgers ?? null;
      return { ...metrics };
    },
    recordError: () => {
      metrics.errorsTotal += 1;
      return { ...metrics };
    },
  };
}

export {
  validateConfig,
  LOG_LEVELS,
  shouldLog,
  formatLogEntry,
  cursorLedger,
  calculateScanLag,
  createMetricsTracker,
};

function loadCursor() {
  if (!existsSync(STATE)) return null;
  return JSON.parse(readFileSync(STATE, "utf8")).cursor ?? null;
}

function saveCursor(cursor) {
  writeFileSync(STATE, JSON.stringify({ cursor }));
}

function decode(ev) {
  const record = {
    ledger: ev.ledger,
    txHash: ev.txHash,
    id: ev.id,
    at: ev.ledgerClosedAt,
  };
  try {
    record.type = scValToNative(ev.topic[0]);
    if (ev.topic.length > 1) record.split = String(scValToNative(ev.topic[1]));
    const data = scValToNative(ev.value);
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        record[key] = typeof value === "bigint" ? String(value) : value;
      }
    }
  } catch {
    record.type = "undecoded";
  }
  return record;
}

let isPolling = false;
let shutdownRequested = false;
let intervalId;
let backoffTimeoutId;
let resumeBackoff;

function sleepUnlessShuttingDown(delayMs) {
  return new Promise((resolve) => {
    resumeBackoff = resolve;
    backoffTimeoutId = setTimeout(() => {
      backoffTimeoutId = undefined;
      resumeBackoff = undefined;
      resolve();
    }, delayMs);
  });
}

function rpcCall(operation) {
  return withRateLimitBackoff(operation, {
    initialDelayMs: BACKOFF_INITIAL_MS,
    maxDelayMs: BACKOFF_MAX_MS,
    sleep: sleepUnlessShuttingDown,
    shouldStop: () => shutdownRequested,
    onBackoff: (error, delayMs) =>
      log("warn", "RPC rate limited; retrying", {
        delayMs,
        error: error?.message ?? String(error),
      }),
  });
}

function handleShutdown(signal) {
  log("info", `Received ${signal}. Shutting down gracefully...`, { signal });
  shutdownRequested = true;
  if (intervalId) {
    clearInterval(intervalId);
  }
  if (backoffTimeoutId) {
    clearTimeout(backoffTimeoutId);
    backoffTimeoutId = undefined;
    resumeBackoff?.();
    resumeBackoff = undefined;
  }
  if (!isPolling) {
    log("info", "State flushed. Exiting cleanly.");
    process.exit(0);
  }
}

// getEvents scans at most ~10k ledgers per call, so one poll pages the
// cursor forward until it catches up with the chain head.
async function poll() {
  if (shutdownRequested) return;
  isPolling = true;
  let cursor = loadCursor();
  const filters = [{ type: "contract", contractIds: [CONTRACT_ID] }];
  let totalThisPoll = 0;
  let latestLedgerSeen = null;

  try {
    for (;;) {
      if (shutdownRequested) break;
      let request;
      if (cursor) {
        request = { cursor, filters, limit: 100 };
      } else {
        const latestLedger = await rpcCall(() => server.getLatestLedger());
        if (!latestLedger) break;
        latestLedgerSeen = latestLedger.sequence;
        request = {
          startLedger: Math.max(1, latestLedger.sequence - 100_000),
          filters,
          limit: 100,
        };
      }

      if (shutdownRequested) break;
      const res = await rpcCall(() => server.getEvents(request));
      if (!res) break;

      if (typeof res.latestLedger === "number") {
        latestLedgerSeen = res.latestLedger;
      }

      for (const ev of res.events) {
        appendFileSync(OUT, JSON.stringify(decode(ev)) + "\n");
      }
      totalThisPoll += res.events.length;

      if (!res.cursor || res.cursor === cursor) break;
      cursor = res.cursor;
      saveCursor(cursor);
      if (shutdownRequested) break;
      if (isCaughtUp({ eventCount: res.events.length, pageLimit: 100, cursor, latestLedger: res.latestLedger })) {
        break;
      }
    }

    const lag = calculateScanLag(latestLedgerSeen, cursor);
    const metrics = metricsTracker.recordPollSuccess({
      eventsIndexed: totalThisPoll,
      scanLagLedgers: lag,
    });

    log("info", "Poll completed", {
      contractId: CONTRACT_ID,
      eventsIndexedLastPoll: metrics.eventsIndexedLastPoll,
      eventsIndexedTotal: metrics.eventsIndexedTotal,
      scanLagLedgers: metrics.scanLagLedgers,
      errorsTotal: metrics.errorsTotal,
      cursor,
    });
  } catch (err) {
    const metrics = metricsTracker.recordError();
    log("error", "Poll execution error", {
      error: err?.message ?? String(err),
      errorsTotal: metrics.errorsTotal,
    });
  } finally {
    isPolling = false;
    if (shutdownRequested) {
      log("info", "State flushed. Exiting cleanly.");
      process.exit(0);
    }
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase();

let log = () => {};
let metricsTracker = createMetricsTracker();
let RPC_URL, CONTRACT_ID, LOG_LEVEL, OUT, STATE, POLL_MS, BACKOFF_INITIAL_MS, BACKOFF_MAX_MS, server;

if (isMain) {
  const config = validateConfig();
  if (!config.ok) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message: config.error,
      })
    );
    process.exit(1);
  }

  ({ RPC_URL, CONTRACT_ID, LOG_LEVEL } = config.value);
  OUT = process.env.OUT ?? "events.ndjson";
  STATE = process.env.STATE ?? "state.json";
  POLL_MS = Number(process.env.POLL_MS ?? 10_000);
  BACKOFF_INITIAL_MS = Number(process.env.BACKOFF_INITIAL_MS ?? 1_000);
  BACKOFF_MAX_MS = Number(process.env.BACKOFF_MAX_MS ?? 60_000);

  log = (level, message, meta = {}) => {
    if (shouldLog(LOG_LEVEL, level)) {
      const line = formatLogEntry(level, message, meta);
      if (level === "error") {
        console.error(line);
      } else if (level === "warn") {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
  };

  server = new rpc.Server(RPC_URL);

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  log("info", "Indexer starting", {
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    pollMs: POLL_MS,
    outPath: OUT,
    statePath: STATE,
    logLevel: LOG_LEVEL,
  });

  await poll();
  intervalId = setInterval(
    () =>
      poll().catch((e) => {
        const metrics = metricsTracker.recordError();
        log("error", "Unhandled error in poll interval", {
          error: e?.message ?? String(e),
          errorsTotal: metrics.errorsTotal,
        });
      }),
    POLL_MS
  );
}
