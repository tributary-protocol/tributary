import type pg from "pg";
import type { NormalizedEvent, SplitCreatedPayload, SplitUpdatedPayload, ControlTransferredPayload } from "../types.js";

export async function applySplitEvent(pool: pg.Pool, ev: NormalizedEvent): Promise<void> {
  switch (ev.type) {
    case "SplitCreated": {
      const p = ev.payload as SplitCreatedPayload;
      await pool.query(
        `INSERT INTO splits (id, creator, recipients, shares, controller, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          ev.split_id,
          p.creator,
          JSON.stringify(p.recipients),
          JSON.stringify(p.shares),
          ev.ledger_closed_at,
        ],
      );
      break;
    }
    case "SplitUpdated": {
      const p = ev.payload as SplitUpdatedPayload;
      await pool.query(
        `UPDATE splits SET recipients = $1, shares = $2, updated_at = $3 WHERE id = $4`,
        [JSON.stringify(p.recipients), JSON.stringify(p.shares), ev.ledger_closed_at, ev.split_id],
      );
      break;
    }
    case "ControlTransferred": {
      const p = ev.payload as ControlTransferredPayload;
      await pool.query(
        `UPDATE splits SET controller = $1, updated_at = $2 WHERE id = $3`,
        [p.new_controller, ev.ledger_closed_at, ev.split_id],
      );
      break;
    }
  }
}
