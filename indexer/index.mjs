import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, fdatasyncSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rpc, scValToNative } from "@stellar/stellar-sdk";

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_CONTRACT_ID =
  "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU";

function validateConfig(env = process.env) {
  const errors = [];
  const RPC_URL = (env.RPC_URL ?? DEFAULT_RPC_URL).trim();
  const CONTRACT_ID = (env.CONTRACT_ID ?? DEFAULT_CONTRACT_ID).trim();

  if (!RPC_URL) errors.push("RPC_URL is required");
  if (!CONTRACT_ID) errors.push("CONTRACT_ID is required");

  if (errors.length > 0) {
    return { ok: false, error: `Invalid indexer configuration:\n- ${errors.join("\n- ")}` };
  }

  return { ok: true, value: { RPC_URL, CONTRACT_ID } };
}

export { validateConfig };

const config = validateConfig();
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}

const { RPC_URL, CONTRACT_ID } = config.value;
const OUT = process.env.OUT ?? "events.ndjson";
const STATE = process.env.STATE ?? "state.json";
const POLL_MS = Number(process.env.POLL_MS ?? 10_000);

export function loadCursor(statePath) {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8")).cursor ?? null;
}

function atomicWrite(path, data) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, data);
  try {
    const fd = openSync(tmp, "r+");
    fdatasyncSync(fd);
    closeSync(fd);
  } catch {
    // fsync is best-effort – tmp+rename is atomic on most platforms
  }
  renameSync(tmp, path);
}

export function saveCursor(statePath, cursor) {
  atomicWrite(statePath, JSON.stringify({ cursor }));
}

export function cursorLedger(cursor) {
  if (!cursor) return 0;
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

function lastEventCursor(outPath) {
  if (!existsSync(outPath)) return null;
  const content = readFileSync(outPath, "utf8").trimEnd();
  if (!content) return null;
  const lines = content.split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  return last._cursor ?? null;
}

export function resolveCursor(statePath, outPath) {
  const state = loadCursor(statePath);
  const output = lastEventCursor(outPath);
  if (!state) return output;
  if (!output) return state;
  const sl = cursorLedger(state);
  const ol = cursorLedger(output);
  if (ol > sl) return output;
  if (ol < sl) return state;
  return state >= output ? state : output;
}

export function decode(ev, responseCursor) {
  const record = {
    ledger: ev.ledger,
    txHash: ev.txHash,
    id: ev.id,
    at: ev.ledgerClosedAt,
    _cursor: responseCursor,
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

export async function poll({ server, contractId, outPath, statePath }) {
  let cursor = resolveCursor(statePath, outPath);
  const filters = [{ type: "contract", contractIds: [contractId] }];
function cursorLedger(cursor) {
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

let isPolling = false;
let shutdownRequested = false;
let intervalId;

function handleShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  shutdownRequested = true;
  if (intervalId) {
    clearInterval(intervalId);
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
  let cursor = loadCursor();
  const filters = [{ type: "contract", contractIds: [CONTRACT_ID] }];
  let total = 0;

  try {
    for (;;) {
      if (shutdownRequested) break;
      const request = cursor
        ? { cursor, filters, limit: 100 }
        : {
            startLedger: Math.max(
              1,
              (await server.getLatestLedger()).sequence - 100_000,
            ),
            filters,
            limit: 100,
          };

    const res = await server.getEvents(request);
    if (res.events.length > 0) {
      const batch = res.events
        .map((ev) => JSON.stringify(decode(ev, res.cursor)) + "\n")
        .join("");
      appendFileSync(outPath, batch);
    }
    total += res.events.length;

    if (!res.cursor || res.cursor === cursor) break;
    cursor = res.cursor;
    saveCursor(statePath, cursor);
    if (res.events.length < 100 && cursorLedger(cursor) >= res.latestLedger) {
      break;
    }
  }

  return total;
}

async function main() {
  const server = new rpc.Server(RPC_URL);
  console.log(`indexing ${CONTRACT_ID} from ${RPC_URL} every ${POLL_MS}ms`);
  const total = await poll({
    server,
    contractId: CONTRACT_ID,
    outPath: OUT,
    statePath: STATE,
  });
  if (total > 0) console.log(`indexed ${total} events`);
  setInterval(
    () =>
      poll({ server, contractId: CONTRACT_ID, outPath: OUT, statePath: STATE }).catch((e) =>
        console.error(e.message ?? e),
      ),
    POLL_MS,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
      const res = await server.getEvents(request);
      for (const ev of res.events) {
        appendFileSync(OUT, JSON.stringify(decode(ev)) + "\n");
      }
      total += res.events.length;

      if (!res.cursor || res.cursor === cursor) break;
      cursor = res.cursor;
      saveCursor(cursor);
      if (shutdownRequested) break;
      if (res.events.length < 100 && cursorLedger(cursor) >= res.latestLedger) {
        break;
      }
    }
  } finally {
    isPolling = false;
    if (total > 0) console.log(`indexed ${total} events`);
    if (shutdownRequested) {
      console.log("State flushed. Exiting cleanly.");
      process.exit(0);
    }
  }
}

console.log(`indexing ${CONTRACT_ID} from ${RPC_URL} every ${POLL_MS}ms`);
await poll();
intervalId = setInterval(() => poll().catch((e) => console.error(e.message ?? e)), POLL_MS);
