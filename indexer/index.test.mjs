import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

// -------------------------------------------------------------------------
// Because index.mjs imports @stellar/stellar-sdk at module level, that
// package must be installed (npm install).  The real scValToNative will be
// called on plain objects, so decode() will set type:"undecoded" for our
// mock events – that is fine; the tests below focus on cursor persistence
// and crash recovery (no gaps / no duplicates).
// -------------------------------------------------------------------------
const { poll, loadCursor, saveCursor, decode, cursorLedger, resolveCursor } = await import(
  "./index.mjs"
);

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function makeCursor(ledger, seq = 0) {
  const high = BigInt(ledger) << 32n;
  return `${high + BigInt(seq)}-${seq}`;
}

class MockServer {
  constructor(eventList, latestLedger = 200_000) {
    this.allEvents = eventList.map((ev, i) => ({ ...ev, _idx: i }));
    this.latestLedger = latestLedger;
  }

  getLatestLedger() {
    return { sequence: this.latestLedger };
  }

  getEvents({ cursor, startLedger, limit = 100 }) {
    let from = 0;
    if (cursor) {
      const pos = this._posFromCursor(cursor);
      from = pos >= 0 ? pos + 1 : this.allEvents.length;
    } else if (startLedger) {
      const idx = this.allEvents.findIndex((e) => e.ledger >= startLedger);
      from = idx >= 0 ? idx : this.allEvents.length;
    }
    const page = this.allEvents.slice(from, from + limit);
    const nextCursor =
      page.length > 0 ? makeCursor(from + page.length - 1) : null;
    return {
      events: page.map(({ _idx, ...rest }) => rest),
      cursor: nextCursor,
      latestLedger: this.latestLedger,
    };
  }

  _posFromCursor(cursor) {
    const parts = cursor.split("-");
    const val = BigInt(parts[0]);
    return Number(val >> 32n);
  }
}

function makeEvent(ledger, seq, type, data = {}) {
  return {
    id: `ev-${ledger}-${seq}`,
    ledger,
    txHash: `tx-${ledger}-${seq}`,
    ledgerClosedAt: new Date(
      Date.UTC(2024, 0, 1, 0, 0, Math.floor(ledger), ledger % 60),
    ).toISOString(),
    // topic and value are plain JS objects, so the real scValToNative will
    // throw and decode() will fall back to {type:"undecoded"} – that is OK.
    topic: type ? [type, "1"] : [],
    value: { amount: "1000", token: "TKN", creator: "alice", ...data },
  };
}

function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "tributary-idx-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

// -------------------------------------------------------------------------
// Unit-level tests
// -------------------------------------------------------------------------

test("loadCursor returns null for missing state file", () => {
  const dir = tmpDir();
  assert.equal(loadCursor(join(dir, "nope.json")), null);
  rmSync(dir, { recursive: true });
});

test("saveCursor and loadCursor round-trip", () => {
  const dir = tmpDir();
  const path = join(dir, "state.json");
  const cursor = makeCursor(1500, 0);
  saveCursor(path, cursor);
  assert.equal(loadCursor(path), cursor);
  rmSync(dir, { recursive: true });
});

test("cursorLedger extracts ledger from cursor", () => {
  assert.equal(cursorLedger(makeCursor(1001, 0)), 1001);
  assert.equal(cursorLedger(makeCursor(500, 3)), 500);
  assert.equal(cursorLedger(null), 0);
});

test('decode adds _cursor and falls back to "undecoded" for plain objects', () => {
  const ev = makeEvent(1001, 0, "split_paid", { amount: "5000" });
  const decoded = decode(ev, "test-cursor");
  assert.equal(decoded._cursor, "test-cursor");
  assert.equal(decoded.id, "ev-1001-0");
  assert.equal(decoded.type, "undecoded");
  assert.equal(decoded.ledger, 1001);
});

test("resolveCursor picks state cursor when no output exists", () => {
  const dir = tmpDir();
  saveCursor(join(dir, "state.json"), makeCursor(1000, 0));
  const resolved = resolveCursor(
    join(dir, "state.json"),
    join(dir, "events.ndjson"),
  );
  assert.equal(resolved, makeCursor(1000, 0));
  rmSync(dir, { recursive: true });
});

test("resolveCursor picks output cursor when it is ahead of state", () => {
  const dir = tmpDir();
  const ev = makeEvent(1500, 0, "split_paid");
  const out = join(dir, "events.ndjson");
  const outputCursor = makeCursor(1500, 0);
  writeFileSync(out, JSON.stringify(decode(ev, outputCursor)) + "\n");
  saveCursor(join(dir, "state.json"), makeCursor(1000, 0));
  const resolved = resolveCursor(join(dir, "state.json"), out);
  assert.equal(cursorLedger(resolved), 1500);
  rmSync(dir, { recursive: true });
});

test("resolveCursor picks state cursor when it equals output cursor", () => {
  const dir = tmpDir();
  const cur = makeCursor(1200, 0);
  const ev = makeEvent(1200, 0, "split_paid");
  const out = join(dir, "events.ndjson");
  writeFileSync(out, JSON.stringify(decode(ev, cur)) + "\n");
  saveCursor(join(dir, "state.json"), cur);
  const resolved = resolveCursor(join(dir, "state.json"), out);
  assert.equal(resolved, cur);
  rmSync(dir, { recursive: true });
});

// -------------------------------------------------------------------------
// Integration – crash recovery
// -------------------------------------------------------------------------

test("crash recovery: no gaps or duplicates after simulated kill-restart", async () => {
  const dir = tmpDir();
  const outPath = join(dir, "events.ndjson");
  const statePath = join(dir, "state.json");

  const events = [];
  for (let i = 0; i < 15; i++) {
    events.push(makeEvent(500 + i, 0, "split_paid"));
  }
  const server = new MockServer(events, 600);

  // first run: index all events
  const total1 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total1, 15);

  const afterFirst = readFileSync(outPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean);
  assert.equal(afterFirst.length, 15);

  // state cursor should match the last event's _cursor
  const savedState = loadCursor(statePath);
  const lastLine = JSON.parse(afterFirst[afterFirst.length - 1]);
  assert.equal(
    savedState,
    lastLine._cursor,
    "state cursor equals last event _cursor after clean poll",
  );

  // simulate crash: reset state to cursor before the last 5 events
  saveCursor(statePath, makeCursor(509, 0));

  // second run – should detect output is ahead of stale state
  const total2 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total2, 0, "no new events indexed – cursor reconciled");

  // verify output: no duplicates, no gaps
  const finalContent = readFileSync(outPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean);
  const finalEvents = finalContent.map((l) => JSON.parse(l));
  const ids = finalEvents.map((e) => e.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, "no duplicate IDs");

  const expectedIds = events.map((e) => e.id);
  for (const expectedId of expectedIds) {
    assert.ok(uniqueIds.has(expectedId), `expected event ${expectedId} present`);
  }
  assert.equal(ids.length, expectedIds.length, "no extra or missing events");

  rmSync(dir, { recursive: true });
});

test("crash recovery: multi-page poll does not duplicate on stale cursor", async () => {
  const dir = tmpDir();
  const outPath = join(dir, "events.ndjson");
  const statePath = join(dir, "state.json");

  // 250 events → forces 3 pages (limit 100)
  const events = [];
  for (let i = 0; i < 250; i++) {
    events.push(makeEvent(1000 + i, 0, "split_paid"));
  }
  const server = new MockServer(events, 1500);

  const total1 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total1, 250);

  // simulate crash: reset state to cursor after page 1
  saveCursor(statePath, makeCursor(1000, 99));

  const total2 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total2, 0, "no duplicates after stale-cursor restart");

  const finalContent = readFileSync(outPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean);
  const ids = finalContent.map((l) => JSON.parse(l).id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate IDs");
  assert.equal(ids.length, 250, "all 250 events present");

  rmSync(dir, { recursive: true });
});

test("fresh poll from empty state writes all events", async () => {
  const dir = tmpDir();
  const outPath = join(dir, "events.ndjson");
  const statePath = join(dir, "state.json");

  const events = [];
  for (let i = 0; i < 10; i++) {
    events.push(makeEvent(2000 + i, 0, "split_paid"));
  }
  const server = new MockServer(events, 3000);

  const total = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total, 10);

  const content = readFileSync(outPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean);
  assert.equal(content.length, 10);
  const last = JSON.parse(content[content.length - 1]);
  assert.equal(last._cursor, loadCursor(statePath), "cursor saved after poll");

  const ids = content.map((l) => JSON.parse(l).id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate IDs");

  rmSync(dir, { recursive: true });
});

test("normal restart from saved cursor continues without gaps", async () => {
  const dir = tmpDir();
  const outPath = join(dir, "events.ndjson");
  const statePath = join(dir, "state.json");

  // First batch: only 10 events visible
  const firstBatch = [];
  for (let i = 0; i < 10; i++) {
    firstBatch.push(makeEvent(3000 + i, 0, "split_paid"));
  }
  const server = new MockServer(firstBatch, 3009);

  const total1 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total1, 10);

  // Add remaining 15 events (simulating new blocks)
  for (let i = 10; i < 25; i++) {
    const ev = makeEvent(3000 + i, 0, "split_paid");
    server.allEvents.push({ ...ev, _idx: server.allEvents.length });
  }
  server.latestLedger = 3024;

  // Second poll should fetch the remaining 15
  const total2 = await poll({ server, contractId: "CX", outPath, statePath });
  assert.equal(total2, 15, "remaining events indexed on restart");

  const content = readFileSync(outPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean);
  assert.equal(content.length, 25);

  const ids = content.map((l) => JSON.parse(l).id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates after restart");
  assert.equal(ids.length, new Set(ids).size, "no missing events after restart");

  rmSync(dir, { recursive: true });
});
