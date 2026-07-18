import { appendFileSync } from "node:fs";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { withRateLimitBackoff } from "./rpc-backoff.mjs";
import {
  validateConfig,
  loadState,
  saveState,
  cursorLedger,
  isCursorSafeToCommit,
  deduplicateEvents,
} from "./state.mjs";

// ---------------------------------------------------------------------------
// Event decoding
// ---------------------------------------------------------------------------

export function decode(ev) {
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

// ---------------------------------------------------------------------------
// Poll loop  (only runs when the file is the entry point)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] != null &&
  new URL(import.meta.url).pathname
    .replace(/^\/([A-Za-z]:)/, "$1")
    .replace(/\//g, "\\") === process.argv[1];

if (isMain) {
  const config = validateConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const { RPC_URL, CONTRACT_ID } = config.value;
  const OUT = process.env.OUT ?? "events.ndjson";
  const STATE = process.env.STATE ?? "state.json";
  const POLL_MS = Number(process.env.POLL_MS ?? 10_000);
  const BACKOFF_INITIAL_MS = Number(process.env.BACKOFF_INITIAL_MS ?? 1_000);
  const BACKOFF_MAX_MS = Number(process.env.BACKOFF_MAX_MS ?? 60_000);
  // How many ledgers behind the chain tip a cursor must be before we commit it.
  // Default 2 covers typical Stellar testnet/mainnet reorg depth.
  const REORG_DEPTH = Number(process.env.REORG_DEPTH ?? 2);

  const server = new rpc.Server(RPC_URL);

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
      onBackoff: (_error, delayMs) =>
        console.warn(`RPC rate limited; retrying in ${delayMs}ms`),
    });
  }

  function handleShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    shutdownRequested = true;
    if (intervalId) clearInterval(intervalId);
    if (backoffTimeoutId) {
      clearTimeout(backoffTimeoutId);
      backoffTimeoutId = undefined;
      resumeBackoff?.();
      resumeBackoff = undefined;
    }
    if (!isPolling) {
      console.log("State flushed. Exiting cleanly.");
      process.exit(0);
    }
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  // getEvents scans at most ~10k ledgers per call, so one poll pages the
  // cursor forward until it catches up with the chain head.
  async function poll() {
    if (shutdownRequested) return;
    isPolling = true;

    // Load both the cursor and the set of already-persisted event ids.
    let { cursor, seenIds } = loadState(STATE);

    const filters = [{ type: "contract", contractIds: [CONTRACT_ID] }];
    let total = 0;

    try {
      for (;;) {
        if (shutdownRequested) break;

        let request;
        if (cursor) {
          request = { cursor, filters, limit: 100 };
        } else {
          const latestLedger = await rpcCall(() => server.getLatestLedger());
          if (!latestLedger) break;
          request = {
            startLedger: Math.max(1, latestLedger.sequence - 100_000),
            filters,
            limit: 100,
          };
        }

        if (shutdownRequested) break;
        const res = await rpcCall(() => server.getEvents(request));
        if (!res) break;

        // Deduplicate against everything seen this process lifetime plus what
        // was loaded from state.json. Fresh events are decoded and written to
        // the output file; already-seen events are silently skipped.
        const freshRaw = deduplicateEvents(res.events, seenIds);
        for (const ev of freshRaw) {
          appendFileSync(OUT, JSON.stringify(decode(ev)) + "\n");
        }
        total += freshRaw.length;

        if (!res.cursor || res.cursor === cursor) break;

        // Only advance the persisted cursor when the candidate ledger is far
        // enough behind the chain tip to be considered final. Events from
        // ledgers within REORG_DEPTH of the tip are re-fetched next poll;
        // the seenIds dedup makes that idempotent.
        if (isCursorSafeToCommit(res.cursor, res.latestLedger, REORG_DEPTH)) {
          cursor = res.cursor;
          saveState(cursor, seenIds, STATE);
        }

        if (shutdownRequested) break;
        if (res.events.length < 100 && cursorLedger(res.cursor) >= res.latestLedger) {
          break;
        }
      }
    } finally {
      isPolling = false;
      if (total > 0) console.log(`indexed ${total} new events`);
      if (shutdownRequested) {
        console.log("State flushed. Exiting cleanly.");
        process.exit(0);
      }
    }
  }

  console.log(`indexing ${CONTRACT_ID} from ${RPC_URL} every ${POLL_MS}ms`);
  await poll();
  intervalId = setInterval(
    () => poll().catch((e) => console.error(e.message ?? e)),
    POLL_MS,
  );
}
