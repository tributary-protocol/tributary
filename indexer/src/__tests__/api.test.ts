import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../api/server.js";
import {
  resetCounter,
} from "./helpers.js";

// API tests use Hono's built-in test client (no real HTTP server needed).
// These tests require a running Postgres with the schema applied.

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("api", () => {
  const app = createApp();

  beforeEach(async () => {
    resetCounter();
    // In a real test setup we'd use a test database and clean it here.
    // For now this is a structural test that the routes mount correctly.
  });

  it("GET /health returns a response", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("cursor");
  });

  it("GET /splits returns paginated list", async () => {
    const res = await app.request("/splits");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("splits");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.splits)).toBe(true);
  });

  it("GET /splits/:id returns 404 for unknown split", async () => {
    const res = await app.request("/splits/999999");
    expect(res.status).toBe(404);
  });

  it("GET /events returns paginated list", async () => {
    const res = await app.request("/events");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("events");
    expect(body).toHaveProperty("total");
  });

  it("GET /recipients/:address/earnings returns earnings", async () => {
    const res = await app.request("/recipients/G_TEST_ADDRESS/earnings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("address", "G_TEST_ADDRESS");
    expect(body).toHaveProperty("earnings");
    expect(body).toHaveProperty("payouts");
  });
});
