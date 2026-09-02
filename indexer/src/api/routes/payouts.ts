import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import type { PayoutRow } from "../../types.js";

export const payoutRoutes = new Hono();

payoutRoutes.get("/splits/:id/payouts", async (c) => {
  const pool = getPool();
  const id = Number(c.req.param("id"));
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = (page - 1) * limit;
  const token = c.req.query("token");

  let query = "SELECT * FROM payout_history WHERE split_id = $1";
  const params: unknown[] = [id];

  if (token) {
    query += " AND token = $2";
    params.push(token);
  }

  const orderParam = params.length + 1;
  const limitParam = params.length + 2;
  const offsetParam = params.length + 3;
  query += ` ORDER BY ledger DESC, id DESC LIMIT $${orderParam} OFFSET $${limitParam}`;
  params.push(limit, offset);

  const { rows } = await pool.query<PayoutRow>(query, params);

  const countQuery = token
    ? "SELECT COUNT(*)::int AS count FROM payout_history WHERE split_id = $1 AND token = $2"
    : "SELECT COUNT(*)::int AS count FROM payout_history WHERE split_id = $1";
  const countParams = token ? [id, token] : [id];
  const { rows: countRows } = await pool.query<{ count: number }>(countQuery, countParams);

  return c.json({
    payouts: rows,
    page,
    limit,
    total: countRows[0]?.count ?? 0,
  });
});
