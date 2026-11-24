import { describe, it, expect, beforeEach } from "vitest";
import type pg from "pg";
import { getPool, closePool } from "../db/pool.js";
import { applySplitEvent } from "../projections/splits.js";
import { applyBalanceEvent } from "../projections/balances.js";
import { applyEvents } from "../projections/apply.js";
import { rebuildProjections } from "../projections/rebuild.js";
import {
  splitCreatedEvent,
  splitPaidEvent,
  depositedEvent,
  distributedEvent,
  splitUpdatedEvent,
  controlTransferredEvent,
  resetCounter,
} from "./helpers.js";

// These tests require a running Postgres instance.
// Set DATABASE_URL to run them, or skip in CI without a database.
const DATABASE_URL = process.env.DATABASE_URL;

const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("projections", () => {
  let pool: pg.Pool;

  beforeEach(async () => {
    resetCounter();
    process.env.DATABASE_URL = DATABASE_URL;
    pool = getPool();

    // Clean all projection tables
    await pool.query("DELETE FROM recipient_earnings");
    await pool.query("DELETE FROM payout_history");
    await pool.query("DELETE FROM split_balances");
    await pool.query("DELETE FROM splits");
    await pool.query("DELETE FROM events");
  });

  describe("split projection", () => {
    it("creates a split on SplitCreated", async () => {
      const ev = splitCreatedEvent(0, "G_CREATOR", [
        { type: "Account", address: "G_A" },
        { type: "Account", address: "G_B" },
      ], [6000, 4000]);

      await applySplitEvent(pool, ev);

      const { rows } = await pool.query("SELECT * FROM splits WHERE id = 0");
      expect(rows).toHaveLength(1);
      expect(rows[0].creator).toBe("G_CREATOR");
      expect(rows[0].shares).toEqual([6000, 4000]);
    });

    it("updates recipients on SplitUpdated", async () => {
      const createEv = splitCreatedEvent(0);
      await applySplitEvent(pool, createEv);

      const updateEv = splitUpdatedEvent(0, [
        { type: "Account", address: "G_NEW_A" },
        { type: "Account", address: "G_NEW_B" },
        { type: "Account", address: "G_NEW_C" },
      ], [5000, 3000, 2000]);
      await applySplitEvent(pool, updateEv);

      const { rows } = await pool.query("SELECT * FROM splits WHERE id = 0");
      expect(rows[0].shares).toEqual([5000, 3000, 2000]);
    });

    it("updates controller on ControlTransferred", async () => {
      const createEv = splitCreatedEvent(0);
      await applySplitEvent(pool, createEv);

      const transferEv = controlTransferredEvent(0, "G_CONTROLLER");
      await applySplitEvent(pool, transferEv);

      const { rows } = await pool.query("SELECT * FROM splits WHERE id = 0");
      expect(rows[0].controller).toBe("G_CONTROLLER");
    });
  });

  describe("balance projection", () => {
    it("credits balance on Deposited", async () => {
      const createEv = splitCreatedEvent(0);
      await applySplitEvent(pool, createEv);

      const depEv = depositedEvent(0, "G_TOKEN", "50000");
      await applyBalanceEvent(pool, depEv);

      const { rows } = await pool.query(
        "SELECT * FROM split_balances WHERE split_id = 0",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].balance).toBe("50000");
    });

    it("decrements balance on Distributed", async () => {
      const createEv = splitCreatedEvent(0);
      await applySplitEvent(pool, createEv);

      const dep1 = depositedEvent(0, "G_TOKEN", "50000");
      const dep2 = depositedEvent(0, "G_TOKEN", "30000");
      await applyBalanceEvent(pool, dep1);
      await applyBalanceEvent(pool, dep2);

      const distEv = distributedEvent(0, "G_TOKEN", "30000");
      await applyBalanceEvent(pool, distEv);

      const { rows } = await pool.query(
        "SELECT * FROM split_balances WHERE split_id = 0",
      );
      expect(rows[0].balance).toBe("50000");
    });

    it("tracks balances per token independently", async () => {
      const createEv = splitCreatedEvent(0);
      await applySplitEvent(pool, createEv);

      const depX = depositedEvent(0, "G_TOKEN_X", "300");
      const depY = depositedEvent(0, "G_TOKEN_Y", "700");
      await applyBalanceEvent(pool, depX);
      await applyBalanceEvent(pool, depY);

      const { rows } = await pool.query(
        "SELECT * FROM split_balances WHERE split_id = 0 ORDER BY token",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].token).toBe("G_TOKEN_X");
      expect(rows[0].balance).toBe("300");
      expect(rows[1].token).toBe("G_TOKEN_Y");
      expect(rows[1].balance).toBe("700");
    });
  });

  describe("applyEvents", () => {
    it("applies multiple events in a single batch", async () => {
      const events = [
        splitCreatedEvent(0, "G_C", [{ type: "Account", address: "G_A" }], [10_000]),
        depositedEvent(0, "G_TOKEN", "1000"),
        depositedEvent(0, "G_TOKEN", "500"),
        distributedEvent(0, "G_TOKEN", "500"),
      ];

      await applyEvents(pool, events);

      const { rows: splits } = await pool.query("SELECT * FROM splits WHERE id = 0");
      expect(splits).toHaveLength(1);

      const { rows: balances } = await pool.query(
        "SELECT * FROM split_balances WHERE split_id = 0",
      );
      expect(balances[0].balance).toBe("1000");
    });
  });

  describe("rebuild", () => {
    it("produces identical state after rebuild", async () => {
      // Build initial state
      const events = [
        splitCreatedEvent(0, "G_C", [
          { type: "Account", address: "G_A" },
          { type: "Account", address: "G_B" },
        ], [6000, 4000]),
        depositedEvent(0, "G_TOKEN", "1000"),
        depositedEvent(0, "G_TOKEN", "500"),
        distributedEvent(0, "G_TOKEN", "500"),
      ];
      await applyEvents(pool, events);

      // Snapshot state
      const { rows: beforeSplits } = await pool.query("SELECT * FROM splits ORDER BY id");
      const { rows: beforeBalances } = await pool.query(
        "SELECT * FROM split_balances ORDER BY split_id, token",
      );

      // Insert events into the events table (rebuild reads from there)
      for (const ev of events) {
        await pool.query(
          `INSERT INTO events (event_id, ledger, ledger_closed_at, tx_hash, type, split_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ev.event_id, ev.ledger, ev.ledger_closed_at, ev.tx_hash, ev.type, ev.split_id, JSON.stringify(ev.payload)],
        );
      }

      // Rebuild
      const result = await rebuildProjections(pool);
      expect(result.events).toBe(events.length);

      // Compare
      const { rows: afterSplits } = await pool.query("SELECT * FROM splits ORDER BY id");
      const { rows: afterBalances } = await pool.query(
        "SELECT * FROM split_balances ORDER BY split_id, token",
      );

      expect(afterSplits).toEqual(beforeSplits);
      expect(afterBalances).toEqual(beforeBalances);
    });
  });
});
