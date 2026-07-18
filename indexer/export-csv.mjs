import { createInterface } from "node:readline";
import { createReadStream, existsSync } from "node:fs";

const IN = process.argv[2] ?? "events.ndjson";
const COLUMNS = ["at", "ledger", "type", "split", "amount", "token", "reference", "creator", "txHash"];

if (!existsSync(IN)) {
  console.error(`${IN} not found. Run the indexer first.`);
  process.exit(1);
}

function cell(value) {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

console.log(COLUMNS.join(","));
const lines = createInterface({ input: createReadStream(IN) });
for await (const line of lines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  console.log(COLUMNS.map((c) => cell(record[c])).join(","));
}
