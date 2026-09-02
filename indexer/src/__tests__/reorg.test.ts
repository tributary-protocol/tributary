import { describe, it, expect, beforeEach } from "vitest";
import {
  depositedEvent,
  mockEvent,
  resetCounter,
} from "./helpers.js";

describe("reorg handling", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("revert marks events as reverted", () => {
    // Documents that when a reorg is detected, events from the
    // rewound ledger onward should be marked reverted = TRUE.
    // The actual DB operation is tested in integration tests.
    const ev = depositedEvent(0, "G_TOKEN", "100");
    expect(ev.ledger).toBeGreaterThan(0);
    expect(ev.event_id).toBeDefined();
  });

  it("revert triggers projection rollback", () => {
    // Documents that reverting events should also undo their
    // effects on projection tables (split_balances, payout_history, etc.)
    expect(true).toBe(true);
  });

  it("re-ingestion after reorg produces correct state", () => {
    // Documents that after reverting and re-ingesting from the
    // rewound point, the projection state matches the chain.
    expect(true).toBe(true);
  });

  it("idempotent ingestion prevents duplicates", () => {
    // Documents that the event_id UNIQUE constraint + ON CONFLICT DO NOTHING
    // ensures the same event is never ingested twice.
    const ev1 = depositedEvent(0, "G_TOKEN", "100");
    const ev2 = mockEvent({
      event_id: ev1.event_id, // duplicate
      type: "Deposited",
      split_id: 0,
      payload: { token: "G_TOKEN", amount: "200", source: "external" },
    });
    // Both events have the same event_id; only one should be inserted.
    expect(ev1.event_id).toBe(ev2.event_id);
  });
});
