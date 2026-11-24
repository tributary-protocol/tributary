import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import { rebuildProjections } from "../../projections/rebuild.js";
import { reconcile } from "../../reconcile.js";
import { setLastReconciliation } from "./health.js";

export const adminRoutes = new Hono();

adminRoutes.post("/admin/rebuild", async (c) => {
  const pool = getPool();
  try {
    const result = await rebuildProjections(pool);
    return c.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ status: "error", message }, 500);
  }
});

adminRoutes.post("/reconcile", async (c) => {
  try {
    const result = await reconcile();
    setLastReconciliation(result);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ status: "error", message }, 500);
  }
});
