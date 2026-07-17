import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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

const server = new rpc.Server(RPC_URL);

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
