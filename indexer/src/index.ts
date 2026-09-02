import { serve } from "@hono/node-server";
import { getPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { startIngestion } from "./ingest.js";
import { startReconciliation } from "./reconcile.js";
import { createApp } from "./api/server.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  console.log("tributary-indexer starting");

  // Run migrations
  await migrate();

  const pool = getPool();
  await pool.query("SELECT 1");
  console.log("database: connected");

  // Start ingestion
  const ingestionTimer = startIngestion();

  // Start reconciliation
  const reconciliationTimer = startReconciliation();

  // Start API server
  const app = createApp();
  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      console.log(`api: listening on http://localhost:${info.port}`);
    },
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log("shutting down");
    clearInterval(ingestionTimer);
    clearInterval(reconciliationTimer);
    server.close();
    const { closePool } = await import("./db/pool.js");
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
