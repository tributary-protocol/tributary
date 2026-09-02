import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import type { DbEvent } from "../../types.js";

export const eventRoutes = new Hono();

eventRoutes.get("/events", async (c) => {
  const pool = getPool();
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = (page - 1) * limit;
  const type = c.req.query("type");
  const splitId = c.req.query("split_id");

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (splitId) {
    params.push(Number(splitId));
    conditions.push(`split_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderParam = params.length + 1;
  const limitParam = params.length + 2;
  const offsetParam = params.length + 3;
  const query = `SELECT * FROM events ${where} ORDER BY id DESC LIMIT $${orderParam} OFFSET $${limitParam}`;
  params.push(limit, offset);

  const { rows } = await pool.query<DbEvent>(query, params);

  const countQuery = `SELECT COUNT(*)::int AS count FROM events ${where}`;
  const countParams = params.slice(0, -3);
  const { rows: countRows } = await pool.query<{ count: number }>(countQuery, countParams);

  return c.json({
    events: rows,
    page,
    limit,
    total: countRows[0]?.count ?? 0,
  });
});
