import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import type { ReconciliationResult } from "../../types.js";

let lastReconciliation: ReconciliationResult | null = null;

export function setLastReconciliation(result: ReconciliationResult): void {
  lastReconciliation = result;
}

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT value FROM ingestion_state WHERE key = 'cursor'",
  );
  const cursor = rows[0]?.value || null;

  return c.json({
    status: lastReconciliation?.status ?? "unknown",
    cursor,
    lastReconciliation: lastReconciliation ?? null,
  });
});
