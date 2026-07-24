import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseLedgerRange, replayRange } from "./replay.mjs";

function cursor(ledger) {
  return `${BigInt(ledger) << 32n}-0`;
}

test("replaying the same range twice leaves storage unchanged", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "tributary-replay-")), "events.ndjson");
  const event = {
    ledger: 20,
    txHash: "tx",
    id: "20-1",
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    topic: [],
    value: null,
  };
  const server = {
    async getEvents() {
      return { events: [event], cursor: cursor(30) };
    },
  };
  const options = {
    server,
    contractId: "contract",
    out,
    startLedger: 10,
    endLedger: 30,
  };

  assert.deepEqual(await replayRange(options), { fetched: 1, inserted: 1 });
  const first = readFileSync(out, "utf8");
  assert.deepEqual(await replayRange(options), { fetched: 1, inserted: 0 });
  assert.equal(readFileSync(out, "utf8"), first);
});

test("replay excludes events outside the inclusive ledger range", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "tributary-replay-")), "events.ndjson");
  const events = [9, 10, 20, 21].map((ledger) => ({
    ledger,
    id: `${ledger}-1`,
    topic: [],
    value: null,
  }));
  const server = {
    async getEvents() {
      return { events, cursor: cursor(21) };
    },
  };

  const result = await replayRange({
    server,
    contractId: "contract",
    out,
    startLedger: 10,
    endLedger: 20,
  });
  assert.deepEqual(result, { fetched: 2, inserted: 2 });
  assert.deepEqual(
    readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).ledger),
    [10, 20],
  );
});

test("ledger ranges are validated", () => {
  assert.deepEqual(parseLedgerRange("1", "2"), { startLedger: 1, endLedger: 2 });
  assert.throws(() => parseLedgerRange("2", "1"), TypeError);
  assert.throws(() => parseLedgerRange("one", "2"), TypeError);
});
