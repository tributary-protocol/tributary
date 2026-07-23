/**
 * Unit tests for the indexer cursor math (indexer/cursor.mjs).
 *
 * Uses Node's built-in test runner — no extra dependencies needed.
 * Run with:  node --test cursor.test.mjs
 *
 * Acceptance criteria (issue #176):
 *   - Tests cover advance, boundaries, and resume.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cursorLedger, isCaughtUp } from "./cursor.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Soroban RPC cursor string from a ledger number.
 * The upper 32 bits of the u64 toid hold the ledger sequence.
 */
function makeCursor(ledger, txIndex = 1) {
  const toid = BigInt(ledger) << 32n;
  return `${toid}-${txIndex}`;
}

// ---------------------------------------------------------------------------
// cursorLedger — advance
// ---------------------------------------------------------------------------

describe("cursorLedger — advance", () => {
  it("extracts ledger 1 from the first possible cursor", () => {
    const cursor = makeCursor(1);
    assert.equal(cursorLedger(cursor), 1);
  });

  it("extracts ledger 500_000 (typical testnet range)", () => {
    const cursor = makeCursor(500_000);
    assert.equal(cursorLedger(cursor), 500_000);
  });

  it("extracts ledger 1_000_000 correctly", () => {
    const cursor = makeCursor(1_000_000);
    assert.equal(cursorLedger(cursor), 1_000_000);
  });

  it("ignores the tx-index suffix", () => {
    // Different tx indices on the same ledger should all return the same ledger.
    assert.equal(cursorLedger(makeCursor(42, 1)), 42);
    assert.equal(cursorLedger(makeCursor(42, 99)), 42);
    assert.equal(cursorLedger(makeCursor(42, 4_294_967_295)), 42);
  });

  it("advances correctly across consecutive ledgers", () => {
    const ledgers = [100, 101, 102, 103, 104];
    for (const ledger of ledgers) {
      assert.equal(cursorLedger(makeCursor(ledger)), ledger);
    }
  });
});

// ---------------------------------------------------------------------------
// cursorLedger — boundaries
// ---------------------------------------------------------------------------

describe("cursorLedger — boundaries", () => {
  it("handles ledger 0 (genesis / edge case)", () => {
    // A cursor of "0-1" means toid = 0, ledger = 0 >> 32 = 0.
    assert.equal(cursorLedger("0-1"), 0);
  });

  it("handles ledger 2^32 - 1 (maximum u32 ledger)", () => {
    const maxLedger = 0xffff_ffff; // 4_294_967_295
    const cursor = makeCursor(maxLedger);
    assert.equal(cursorLedger(cursor), maxLedger);
  });

  it("does not overflow with large ledger numbers", () => {
    // Ledger numbers are stored in the upper 32 bits of a u64 toid.
    // 2^32 - 1 is the absolute max; anything larger would violate the spec,
    // but the BigInt arithmetic should still be well-defined.
    const ledger = 0x1_0000_0000; // one above u32 max — triggers the upper bits
    const toid = BigInt(ledger) << 32n;
    const cursor = `${toid}-1`;
    // The lower 32 bits of the shift are still zero, upper bits remain.
    assert.equal(cursorLedger(cursor), ledger);
  });
});

// ---------------------------------------------------------------------------
// cursorLedger — resume (the state file persists a cursor between restarts)
// ---------------------------------------------------------------------------

describe("cursorLedger — resume", () => {
  it("round-trips: a cursor produced at ledger N survives serialisation", () => {
    const originalLedger = 987_654;
    const cursor = makeCursor(originalLedger);
    // Simulate what the indexer stores in state.json and reads back.
    const serialised = JSON.stringify({ cursor });
    const restored = JSON.parse(serialised).cursor;
    assert.equal(cursorLedger(restored), originalLedger);
  });

  it("two cursors on the same ledger but different tx positions are both readable", () => {
    const ledger = 200;
    const c1 = makeCursor(ledger, 1);
    const c2 = makeCursor(ledger, 7);
    assert.equal(cursorLedger(c1), ledger);
    assert.equal(cursorLedger(c2), ledger);
    // They should be ordered by their raw string (c1 < c2) but resolve the
    // same ledger.
    assert.notEqual(c1, c2);
  });
});

// ---------------------------------------------------------------------------
// isCaughtUp — determines when the poll loop should stop paging
// ---------------------------------------------------------------------------

describe("isCaughtUp", () => {
  it("returns true when event count is below the page limit and cursor is at head", () => {
    assert.equal(
      isCaughtUp({
        eventCount: 42,
        pageLimit: 100,
        cursor: makeCursor(500),
        latestLedger: 500,
      }),
      true,
    );
  });

  it("returns true when cursor ledger is ahead of latest (edge case)", () => {
    assert.equal(
      isCaughtUp({
        eventCount: 0,
        pageLimit: 100,
        cursor: makeCursor(600),
        latestLedger: 500,
      }),
      true,
    );
  });

  it("returns false when a full page was returned (more pages may exist)", () => {
    assert.equal(
      isCaughtUp({
        eventCount: 100,
        pageLimit: 100,
        cursor: makeCursor(400),
        latestLedger: 500,
      }),
      false,
    );
  });

  it("returns false when event count is below limit but cursor is behind head", () => {
    assert.equal(
      isCaughtUp({
        eventCount: 50,
        pageLimit: 100,
        cursor: makeCursor(300),
        latestLedger: 500,
      }),
      false,
    );
  });

  it("returns false when a full page is returned even if cursor is at head", () => {
    // A full page means there might be more events on the same ledger range.
    assert.equal(
      isCaughtUp({
        eventCount: 100,
        pageLimit: 100,
        cursor: makeCursor(500),
        latestLedger: 500,
      }),
      false,
    );
  });
});
