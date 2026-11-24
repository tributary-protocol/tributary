import type pg from "pg";
import type { NormalizedEvent } from "../types.js";
import { applySplitEvent } from "./splits.js";
import { applyBalanceEvent } from "./balances.js";
import { applyPayoutEvent } from "./payouts.js";

export async function applyEvents(
  pool: pg.Pool,
  events: NormalizedEvent[],
): Promise<void> {
  if (events.length === 0) return;

  await pool.query("BEGIN");
  try {
    for (const ev of events) {
      await applySplitEvent(pool, ev);
      await applyBalanceEvent(pool, ev);
      await applyPayoutEvent(pool, ev);
    }
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
