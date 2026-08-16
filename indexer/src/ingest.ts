import type pg from "pg";
import { rpc } from "@stellar/stellar-sdk";
import { getPool } from "./db/pool.js";
import { decodeEvent } from "./decode.js";
import { applyEvents } from "./projections/apply.js";
import type { NormalizedEvent } from "./types.js";
import { config } from "./config.js";

const server = new rpc.Server(config.rpcUrl);

function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split("-")[0]) >> 32n);
}

async function loadCursor(pool: pg.Pool): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT value FROM ingestion_state WHERE key = 'cursor'",
  );
  return rows[0]?.value || null;
}

async function saveCursor(pool: pg.Pool, cursor: string): Promise<void> {
  await pool.query(
    "UPDATE ingestion_state SET value = $1 WHERE key = 'cursor'",
    [cursor],
  );
}

async function markReverted(pool: pg.Pool, fromLedger: number): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE events SET reverted = TRUE WHERE ledger >= $1 AND NOT reverted",
    [fromLedger],
  );
  return rowCount ?? 0;
}

async function deleteRevertedProjections(pool: pg.Pool, fromLedger: number): Promise<void> {
  await pool.query("DELETE FROM payout_history WHERE ledger >= $1", [fromLedger]);
  await pool.query(
    `DELETE FROM recipient_earnings WHERE address IN (
       SELECT DISTINCT recipient FROM payout_history WHERE ledger >= $1
     )`,
    [fromLedger],
  );
  // Balances are rebuilt by replay; we reset them here for the affected splits.
  await pool.query(
    `DELETE FROM split_balances WHERE split_id IN (
       SELECT DISTINCT split_id FROM events WHERE ledger >= $1 AND reverted
     )`,
    [fromLedger],
  );
  await pool.query(
    `DELETE FROM splits WHERE id IN (
       SELECT DISTINCT split_id FROM events WHERE ledger >= $1 AND type = 'SplitCreated' AND reverted
     )`,
    [fromLedger],
  );
}

async function insertEvents(
  pool: pg.Pool,
  events: NormalizedEvent[],
): Promise<NormalizedEvent[]> {
  const inserted: NormalizedEvent[] = [];
  for (const ev of events) {
    const { rowCount } = await pool.query(
      `INSERT INTO events (event_id, ledger, ledger_closed_at, tx_hash, type, split_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        ev.event_id,
        ev.ledger,
        ev.ledger_closed_at,
        ev.tx_hash,
        ev.type,
        ev.split_id,
        JSON.stringify(ev.payload),
      ],
    );
    if (rowCount && rowCount > 0) inserted.push(ev);
  }
  return inserted;
}

async function poll(): Promise<void> {
  const pool = getPool();
  let cursor = await loadCursor(pool);

  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [config.contractId] }];
  let total = 0;

  for (;;) {
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

    // Reorg detection: if cursor rewinds, revert affected events.
    if (cursor && res.events.length > 0) {
      const newLedger = res.events[0].ledger;
      const prevLedger = cursorLedger(cursor);
      if (newLedger < prevLedger) {
        console.log(`reorg detected: rewinding from ledger ${prevLedger} to ${newLedger}`);
        const reverted = await markReverted(pool, newLedger);
        if (reverted > 0) {
          await deleteRevertedProjections(pool, newLedger);
          console.log(`reverted ${reverted} events from ledger ${newLedger}`);
        }
      }
    }

    const decoded = res.events
      .map((ev) => decodeEvent(ev))
      .filter((ev): ev is NormalizedEvent => ev !== null);

    const inserted = await insertEvents(pool, decoded);
    if (inserted.length > 0) {
      await applyEvents(pool, inserted);
    }

    total += inserted.length;

    if (!res.cursor || res.cursor === cursor) break;
    cursor = res.cursor;
    await saveCursor(pool, cursor);
    if (res.events.length < 100 && cursorLedger(cursor) >= res.latestLedger) {
      break;
    }
  }

  if (total > 0) console.log(`ingested ${total} events`);
}

let running = false;

export async function pollOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await poll();
  } finally {
    running = false;
  }
}

export function startIngestion(): NodeJS.Timeout {
  console.log(
    `ingestion: polling ${config.contractId} from ${config.rpcUrl} every ${config.pollMs}ms`,
  );
  void pollOnce();
  return setInterval(() => pollOnce().catch((e) => console.error(e.message ?? e)), config.pollMs);
}
