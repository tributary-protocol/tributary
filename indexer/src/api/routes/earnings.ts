import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import type { EarningsRow, PayoutRow } from "../../types.js";

export const earningsRoutes = new Hono();

earningsRoutes.get("/recipients/:address/earnings", async (c) => {
  const pool = getPool();
  const address = c.req.param("address");

  const { rows } = await pool.query<EarningsRow>(
    "SELECT * FROM recipient_earnings WHERE address = $1",
    [address],
  );

  if (rows.length === 0) {
    return c.json({
      address,
      earnings: null,
      payouts: [],
    });
  }

  const { rows: payouts } = await pool.query<PayoutRow>(
    "SELECT * FROM payout_history WHERE recipient = $1 ORDER BY ledger DESC LIMIT 50",
    [address],
  );

  return c.json({
    address,
    earnings: rows[0],
    payouts,
  });
});
