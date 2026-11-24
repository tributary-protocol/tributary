import type pg from "pg";
import type { NormalizedEvent, DepositedPayload, DistributedPayload } from "../types.js";

export async function applyBalanceEvent(pool: pg.Pool, ev: NormalizedEvent): Promise<void> {
  switch (ev.type) {
    case "Deposited": {
      const p = ev.payload as DepositedPayload;
      await pool.query(
        `INSERT INTO split_balances (split_id, token, balance, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (split_id, token) DO UPDATE
         SET balance = split_balances.balance + $3, updated_at = $4`,
        [ev.split_id, p.token, p.amount, ev.ledger_closed_at],
      );
      break;
    }
    case "Distributed": {
      const p = ev.payload as DistributedPayload;
      await pool.query(
        `UPDATE split_balances
         SET balance = balance - $1, updated_at = $3
         WHERE split_id = $2 AND token = $4`,
        [p.amount, ev.split_id, ev.ledger_closed_at, p.token],
      );
      break;
    }
  }
}
