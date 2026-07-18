/**
 * Indexer tests.
 *
 * Pure-logic helpers (validateConfig, state management, dedup, cursor math)
 * are imported from state.mjs which has no external dependencies, so these
 * tests run without @stellar/stellar-sdk installed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  validateConfig,
  loadState,
  saveState,
  cursorLedger,
  isCursorSafeToCommit,
  deduplicateEvents,
} from "./state.mjs";

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

test("validateConfig rejects missing required env values", () => {
  const result = validateConfig({ CONTRACT_ID: "", RPC_URL: "" });
  assert.equal(result.ok, false);
  assert.match(result.error, /CONTRACT_ID/);
  assert.match(result.error, /RPC_URL/);
});

test("validateConfig accepts populated env values", () => {
  const result = validateConfig({
    CONTRACT_ID: "CC123",
    RPC_URL: "https://example.com",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.CONTRACT_ID, "CC123");
  assert.equal(result.value.RPC_URL, "https://example.com");
});

// ---------------------------------------------------------------------------
// cursorLedger
// ---------------------------------------------------------------------------

test("cursorLedger extracts the ledger sequence from a cursor string", () => {
  // Ledger 100 shifted left 32 bits
  const cursor = `${100n << 32n}-1-0`;
  assert.equal(cursorLedger(cursor), 100);
});

test("cursorLedger handles large ledger numbers", () => {
  const ledger = 50_000_000;
  const cursor = `${BigInt(ledger) << 32n}-0-0`;
  assert.equal(cursorLedger(cursor), ledger);
});

// ---------------------------------------------------------------------------
// isCursorSafeToCommit
// ---------------------------------------------------------------------------

test("isCursorSafeToCommit returns true when cursor ledger is well behind tip", () => {
  const cursor = `${200n << 32n}-0-0`; // ledger 200, tip 210, depth 2
  assert.equal(isCursorSafeToCommit(cursor, 210, 2), true);
});

test("isCursorSafeToCommit returns true at exactly tip minus reorgDepth", () => {
  const cursor = `${208n << 32n}-0-0`; // 208 <= 210 - 2
  assert.equal(isCursorSafeToCommit(cursor, 210, 2), true);
});

test("isCursorSafeToCommit returns false when cursor ledger is within reorg window", () => {
  const cursor = `${209n << 32n}-0-0`; // 209 > 210 - 2
  assert.equal(isCursorSafeToCommit(cursor, 210, 2), false);
});

test("isCursorSafeToCommit returns false when cursor ledger equals tip", () => {
  const cursor = `${210n << 32n}-0-0`;
  assert.equal(isCursorSafeToCommit(cursor, 210, 2), false);
});

// ---------------------------------------------------------------------------
// deduplicateEvents
// ---------------------------------------------------------------------------

function makeRawEvent(id, ledger = 1) {
  return { id, ledger, txHash: `tx-${id}`, ledgerClosedAt: "2024-01-01T00:00:00Z" };
}

test("deduplicateEvents returns all events when seenIds is empty", () => {
  const seenIds = new Set();
  const events = [makeRawEvent("a"), makeRawEvent("b")];
  const fresh = deduplicateEvents(events, seenIds);
  assert.equal(fresh.length, 2);
  assert.ok(seenIds.has("a") && seenIds.has("b"));
});

test("deduplicateEvents skips events whose id is already in seenIds", () => {
  const seenIds = new Set(["a"]);
  const events = [makeRawEvent("a"), makeRawEvent("b"), makeRawEvent("c")];
  const fresh = deduplicateEvents(events, seenIds);
  assert.equal(fresh.length, 2);
  assert.ok(fresh.every((e) => e.id !== "a"), "event 'a' must not appear");
  assert.ok(seenIds.has("b") && seenIds.has("c"));
});

test("deduplicateEvents is idempotent: re-scanning the same events produces no output", () => {
  const seenIds = new Set(["a", "b"]);
  const fresh = deduplicateEvents([makeRawEvent("a"), makeRawEvent("b")], seenIds);
  assert.equal(fresh.length, 0);
  assert.equal(seenIds.size, 2); // unchanged
});

test("deduplicateEvents does not grow seenIds when all events are duplicates", () => {
  const seenIds = new Set(["x"]);
  deduplicateEvents([makeRawEvent("x")], seenIds);
  deduplicateEvents([makeRawEvent("x")], seenIds);
  assert.equal(seenIds.size, 1);
});

test("deduplicateEvents handles an empty event list", () => {
  const seenIds = new Set(["existing"]);
  const fresh = deduplicateEvents([], seenIds);
  assert.equal(fresh.length, 0);
  assert.equal(seenIds.size, 1);
});

test("deduplicateEvents with a reorg: overlapping re-scan only writes new events", () => {
  // Simulate initial scan: events a, b, c written
  const seenIds = new Set(["a", "b", "c"]);
  // Reorg: rescan from earlier ledger returns a, b, c plus a new event d
  const rescan = [makeRawEvent("a"), makeRawEvent("b"), makeRawEvent("c"), makeRawEvent("d")];
  const fresh = deduplicateEvents(rescan, seenIds);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, "d");
  assert.ok(seenIds.has("d"));
});

// ---------------------------------------------------------------------------
// loadState / saveState
// ---------------------------------------------------------------------------

let tmpDir;
test.before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tributary-test-"));
});
test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("loadState returns null cursor and empty seenIds when file does not exist", () => {
  const { cursor, seenIds } = loadState(join(tmpDir, "nonexistent.json"));
  assert.equal(cursor, null);
  assert.equal(seenIds.size, 0);
});

test("loadState returns null cursor and empty seenIds when file is corrupt", () => {
  const p = join(tmpDir, "corrupt.json");
  writeFileSync(p, "not json");
  const { cursor, seenIds } = loadState(p);
  assert.equal(cursor, null);
  assert.equal(seenIds.size, 0);
});

test("saveState and loadState round-trip cursor and seenIds", () => {
  const p = join(tmpDir, "state.json");
  const ids = new Set(["ev-1", "ev-2", "ev-3"]);
  saveState("cursor-abc", ids, p);

  const { cursor, seenIds } = loadState(p);
  assert.equal(cursor, "cursor-abc");
  assert.deepEqual([...seenIds].sort(), ["ev-1", "ev-2", "ev-3"]);
});

test("saveState overwrites existing state cleanly", () => {
  const p = join(tmpDir, "overwrite.json");
  saveState("old-cursor", new Set(["old-id"]), p);
  saveState("new-cursor", new Set(["new-id-1", "new-id-2"]), p);

  const { cursor, seenIds } = loadState(p);
  assert.equal(cursor, "new-cursor");
  assert.ok(!seenIds.has("old-id"), "old id must not survive overwrite");
  assert.ok(seenIds.has("new-id-1") && seenIds.has("new-id-2"));
});

test("loadState tolerates missing seenIds field (legacy state.json)", () => {
  const p = join(tmpDir, "legacy.json");
  // Old format had only { cursor }
  writeFileSync(p, JSON.stringify({ cursor: "legacy-cursor" }));
  const { cursor, seenIds } = loadState(p);
  assert.equal(cursor, "legacy-cursor");
  assert.equal(seenIds.size, 0);
});

test("seenIds survives a save/load round-trip with many ids", () => {
  const p = join(tmpDir, "many-ids.json");
  const ids = new Set(Array.from({ length: 500 }, (_, i) => `ev-${i}`));
  saveState("cursor-x", ids, p);
  const { seenIds } = loadState(p);
  assert.equal(seenIds.size, 500);
  assert.ok(seenIds.has("ev-0") && seenIds.has("ev-499"));
});
