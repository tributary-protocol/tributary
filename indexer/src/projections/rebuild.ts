import type pg from "pg";
import { applyEvents } from "./apply.js";

/**
 * Drop all projection data and rebuild from the event log.
 * This is deterministic: replaying the same events always produces the same state.
 */
export async function rebuildProjections(pool: pg.Pool): Promise<{ events: number }> {
  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM recipient_earnings");
    await pool.query("DELETE FROM payout_history");
    await pool.query("DELETE FROM split_balances");
    await pool.query("DELETE FROM splits");
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT id, event_id, ledger, ledger_closed_at, tx_hash, type, split_id, payload
     FROM events
     WHERE NOT reverted
     ORDER BY id ASC`,
  );

  const events = rows.map((r) => ({
    id: r.id,
    event_id: r.event_id,
    ledger: r.ledger,
    ledger_closed_at: r.ledger_closed_at,
    tx_hash: r.tx_hash,
    type: r.type,
    split_id: r.split_id,
    payload: r.payload,
  }));

  await applyEvents(pool, events);

  return { events: events.length };
}
