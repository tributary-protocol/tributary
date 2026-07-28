import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { upsertEvents } from "./storage.mjs";

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

export function cursorLedger(cursor) {
  if (typeof cursor !== "string" || !cursor.includes("-")) return null;
  try {
    return Number(BigInt(cursor.split("-")[0]) >> 32n);
  } catch {
    return null;
  }
}

export function parseLedgerRange(start, end) {
  const startLedger = Number(start);
  const endLedger = Number(end);
  if (
    !Number.isSafeInteger(startLedger) ||
    !Number.isSafeInteger(endLedger) ||
    startLedger < 1 ||
    endLedger < startLedger
  ) {
    throw new TypeError("ledger range must be positive integers with start <= end");
  }
  return { startLedger, endLedger };
}

export async function replayRange({
  server,
  contractId,
  out,
  startLedger,
  endLedger,
}) {
  const filters = [{ type: "contract", contractIds: [contractId] }];
  let cursor;
  let fetched = 0;
  let inserted = 0;

  for (;;) {
    const request = cursor
      ? { cursor, filters, limit: 100 }
      : { startLedger, filters, limit: 100 };
    const response = await server.getEvents(request);
    const events = response.events
      .filter((event) => event.ledger >= startLedger && event.ledger <= endLedger)
      .map(decode);
    fetched += events.length;
    inserted += upsertEvents(out, events);

    if (!response.cursor || response.cursor === cursor) break;
    cursor = response.cursor;
    if (cursorLedger(cursor) >= endLedger) break;
  }

  return { fetched, inserted };
}

export function createServer(url) {
  return new rpc.Server(url);
}
