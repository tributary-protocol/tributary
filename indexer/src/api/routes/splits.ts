import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import type { SplitRow, BalanceRow } from "../../types.js";

export const splitRoutes = new Hono();

splitRoutes.get("/splits", async (c) => {
  const pool = getPool();
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = (page - 1) * limit;
  const creator = c.req.query("creator");

  let query = "SELECT * FROM splits";
  const params: unknown[] = [];

  if (creator) {
    query += " WHERE creator = $1";
    params.push(creator);
  }

  query += " ORDER BY id ASC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
  params.push(limit, offset);

  const { rows } = await pool.query<SplitRow>(query, params);

  const countQuery = creator
    ? "SELECT COUNT(*)::int AS count FROM splits WHERE creator = $1"
    : "SELECT COUNT(*)::int AS count FROM splits";
  const countParams = creator ? [creator] : [];
  const { rows: countRows } = await pool.query<{ count: number }>(countQuery, countParams);

  return c.json({
    splits: rows,
    page,
    limit,
    total: countRows[0]?.count ?? 0,
  });
});

splitRoutes.get("/splits/:id", async (c) => {
  const pool = getPool();
  const id = Number(c.req.param("id"));

  const { rows } = await pool.query<SplitRow>(
    "SELECT * FROM splits WHERE id = $1",
    [id],
  );

  if (rows.length === 0) {
    return c.json({ error: "Split not found" }, 404);
  }

  const { rows: balances } = await pool.query<BalanceRow>(
    "SELECT * FROM split_balances WHERE split_id = $1 ORDER BY token",
    [id],
  );

  return c.json({
    ...rows[0],
    balances,
  });
});

splitRoutes.get("/splits/:id/balances", async (c) => {
  const pool = getPool();
  const id = Number(c.req.param("id"));

  const { rows } = await pool.query<BalanceRow>(
    "SELECT * FROM split_balances WHERE split_id = $1 ORDER BY token",
    [id],
  );

  return c.json({ balances: rows });
});
