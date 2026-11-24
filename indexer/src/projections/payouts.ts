import type pg from "pg";
import type { NormalizedEvent, SplitPaidPayload, DistributedPayload, PayoutLeg } from "../types.js";

async function insertLegs(
  pool: pg.Pool,
  ev: NormalizedEvent,
  token: string,
  totalAmount: string,
  legs: PayoutLeg[],
): Promise<void> {
  for (const leg of legs) {
    await pool.query(
      `INSERT INTO payout_history (split_id, token, total_amount, recipient, share_bps, leg_amount, tx_hash, ledger, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ev.split_id,
        token,
        totalAmount,
        leg.recipient,
        leg.share_bps,
        leg.leg_amount,
        ev.tx_hash,
        ev.ledger,
        ev.ledger_closed_at,
      ],
    );

    await pool.query(
      `INSERT INTO recipient_earnings (address, token, total_earned, payout_count, last_payout_at)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (address) DO UPDATE SET
         total_earned = recipient_earnings.total_earned + $3,
         payout_count = recipient_earnings.payout_count + 1,
         last_payout_at = GREATEST(recipient_earnings.last_payout_at, $4)`,
      [leg.recipient, token, leg.leg_amount, ev.ledger_closed_at],
    );
  }
}

export async function applyPayoutEvent(pool: pg.Pool, ev: NormalizedEvent): Promise<void> {
  switch (ev.type) {
    case "SplitPaid": {
      const p = ev.payload as SplitPaidPayload;
      if (p.legs && p.legs.length > 0) {
        await insertLegs(pool, ev, p.token, p.amount, p.legs);
      }
      break;
    }
    case "Distributed": {
      const p = ev.payload as DistributedPayload;
      if (p.legs && p.legs.length > 0) {
        await insertLegs(pool, ev, p.token, p.amount, p.legs);
      }
      break;
    }
  }
}
