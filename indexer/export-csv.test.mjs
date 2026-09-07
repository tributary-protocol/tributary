/**
 * CSV export tests.
 *
 * export-csv.mjs is a script, not a module: it reads process.argv at import time,
 * writes to stdout and calls process.exit. So these drive it the way an operator
 * does -- as a subprocess over a fixture ndjson file -- and assert on its stdout.
 * That also covers the argv and exit-code behaviour, which importing could not.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "export-csv.mjs");
const HEADER = "at,ledger,type,split,amount,token,creator,txHash";

/** Write *lines* to a fresh ndjson file and return its path plus the temp dir. */
function fixture(lines) {
  const dir = mkdtempSync(join(tmpdir(), "tributary-csv-"));
  const path = join(dir, "events.ndjson");
  writeFileSync(path, lines.join("\n"), "utf8");
  return { dir, path };
}

function record(over = {}) {
  return {
    at: "2026-08-11T00:00:00Z",
    ledger: 12345,
    type: "Deposited",
    split: "SPLIT1",
    amount: "1000",
    token: "USDC",
    creator: "GCREATOR",
    txHash: "abc123",
    ...over,
  };
}

/** Run the export and return its stdout as trimmed lines. */
function exportCsv(args, options = {}) {
  const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    ...options,
  });
  return stdout.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

test("export emits the header row even for an empty log", (t) => {
  const { dir, path } = fixture([]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.deepEqual(rows, [HEADER]);
});

test("export emits one row per record, in column order", (t) => {
  const { dir, path } = fixture([
    JSON.stringify(record({ ledger: 1, txHash: "tx1" })),
    JSON.stringify(record({ ledger: 2, txHash: "tx2" })),
    JSON.stringify(record({ ledger: 3, txHash: "tx3" })),
  ]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.equal(rows.length, 4, "header plus three records");
  assert.equal(rows[0], HEADER);
  assert.equal(rows[1], "2026-08-11T00:00:00Z,1,Deposited,SPLIT1,1000,USDC,GCREATOR,tx1");
  assert.equal(rows[3], "2026-08-11T00:00:00Z,3,Deposited,SPLIT1,1000,USDC,GCREATOR,tx3");
});

test("export skips blank and whitespace-only lines", (t) => {
  const { dir, path } = fixture([
    JSON.stringify(record({ txHash: "tx1" })),
    "",
    "   ",
    JSON.stringify(record({ txHash: "tx2" })),
    "",
  ]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.equal(rows.length, 3, "blank lines must not become empty CSV rows");
});

test("export leaves a missing field as an empty cell rather than 'undefined'", (t) => {
  const partial = { at: "2026-08-11T00:00:00Z", ledger: 7, type: "Distributed" };
  const { dir, path } = fixture([JSON.stringify(partial)]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.equal(rows[1], "2026-08-11T00:00:00Z,7,Distributed,,,,,");
  assert.ok(!rows[1].includes("undefined"), "a missing field must not print as 'undefined'");
});

test("export treats an explicit null as an empty cell", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ token: null, creator: null }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.equal(rows[1], "2026-08-11T00:00:00Z,12345,Deposited,SPLIT1,1000,,,abc123");
  assert.ok(!rows[1].includes("null"), "a null field must not print as 'null'");
});

test("export quotes cells containing a comma", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ type: "Deposited,Routed" }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.ok(rows[1].includes('"Deposited,Routed"'), rows[1]);
  // Still eight fields: the quoted comma must not split the row.
  assert.equal(rows[1].match(/,/g).length, 8, "one embedded comma plus seven separators");
});

test("export doubles embedded quotes, per RFC 4180", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ creator: 'G"QUOTED"' }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.ok(rows[1].includes('"G""QUOTED"""'), rows[1]);
});

test("export quotes a cell containing a newline so the row stays one record", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ type: "Two\nLines" }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const stdout = execFileSync(process.execPath, [SCRIPT, path], { encoding: "utf8" });

  assert.ok(stdout.includes('"Two\nLines"'), "the newline must be inside quotes");
});

test("export ignores fields that are not exported columns", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ internalCursor: "leaked" }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const rows = exportCsv([path]);

  assert.equal(rows[0], HEADER, "header is fixed by COLUMNS");
  assert.ok(!rows[1].includes("leaked"), "an unlisted field must not reach the CSV");
});

test("export defaults to events.ndjson in the working directory", (t) => {
  const { dir, path } = fixture([JSON.stringify(record({ txHash: "default" }))]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.ok(path.endsWith("events.ndjson"));

  const rows = exportCsv([], { cwd: dir });

  assert.equal(rows.length, 2);
  assert.ok(rows[1].endsWith("default"));
});

test("export fails loudly when the input file is missing", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tributary-csv-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  let error;
  try {
    execFileSync(process.execPath, [SCRIPT, join(dir, "nope.ndjson")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    error = err;
  }

  assert.ok(error, "a missing input must not exit 0");
  assert.equal(error.status, 1);
  assert.match(error.stderr, /not found\. Run the indexer first\./);
});
