import { createInterface } from "node:readline";
import { createReadStream, existsSync } from "node:fs";

const IN = process.argv[2] ?? "events.ndjson";
const COLUMNS = ["at", "ledger", "type", "split", "amount", "token", "creator", "txHash"];

function cell(value) {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[,"\n]/.test(s) ? `""${s.replaceAll('"', '""')}"`" : s;
}

if (process.argv[2] === "--test") {
  const fixture = [
    { at: "2023-01-01T00:00:00Z", ledger: 1, type: "issue", split: "100", amount: "1000", token: "TOKEN", creator: "alice", txHash: "abc" },
    { at: "2023-01-02T00:00:00Z", ledger: 2, type: "transfer", split: "50", amount: "500", token: "TOKEN", creator: "bob", txHash: "def" }
  ];
  const lines = [COLUMNS.join(",")];
  for (const record of fixture) {
    lines.push(COLUMNS.map((c) => cell(record[c])).join(","));
  }
  const output = lines.join("\n");
  const expected = `at,ledger,type,split,amount,token,creator,txHash
\n2023-01-01T00:00:00Z,1,issue,100,1000,TOKEN,alice,abc
\n2023-01-02T00:00:00Z,2,transfer,50,500,TOKEN,bob,def`;
  if (output !== expected) {
    console.error("CSV export test failed");
    process.exit(1);
  }
  console.log("CSV export test passed");
  process.exit(0);
}

if (!existsSync(IN)) {
  console.error(`${IN} not found. Run the indexer first.`);
  process.exit(1);
}

console.log(COLUMNS.join(","));
const lines = createInterface({ input: createReadStream(IN) });
for await (const line of lines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  console.log(COLUMNS.map((c) => cell(record[c])).join(","));
}
