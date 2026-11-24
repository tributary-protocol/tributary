import { Hono } from "hono";
import { healthRoutes } from "./routes/health.js";
import { splitRoutes } from "./routes/splits.js";
import { payoutRoutes } from "./routes/payouts.js";
import { earningsRoutes } from "./routes/earnings.js";
import { eventRoutes } from "./routes/events.js";
import { adminRoutes } from "./routes/admin.js";

export function createApp(): Hono {
  const app = new Hono();

  app.route("/", healthRoutes);
  app.route("/", splitRoutes);
  app.route("/", payoutRoutes);
  app.route("/", earningsRoutes);
  app.route("/", eventRoutes);
  app.route("/", adminRoutes);

  return app;
}
