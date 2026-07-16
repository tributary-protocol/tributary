/**
 * validate-schema.mjs
 *
 * Validates every line in events.ndjson against events.schema.json.
 *
 * Usage:
 *   node validate-schema.mjs [path/to/events.ndjson]
 *
 * Exit codes:
 *   0  – all lines are valid (or the file does not exist yet)
 *   1  – one or more lines failed validation
 */

import { createInterface } from "node:readline";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dir = dirname(fileURLToPath(import.meta.url));

const IN = resolve(process.argv[2] ?? join(__dir, "events.ndjson"));
const SCHEMA_PATH = join(__dir, "events.schema.json");

// ------------------------------------------------------------------
// Load schema
// ------------------------------------------------------------------
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

// ------------------------------------------------------------------
// Validate
// ------------------------------------------------------------------
if (!existsSync(IN)) {
  console.log(`${IN} not found – nothing to validate.`);
  process.exit(0);
}

let lineNum = 0;
let errorCount = 0;

const rl = createInterface({ input: createReadStream(IN), crlfDelay: Infinity });

for await (const raw of rl) {
  const line = raw.trim();
  if (!line) continue;

  lineNum += 1;

  let record;
  try {
    record = JSON.parse(line);
  } catch (e) {
    console.error(`Line ${lineNum}: invalid JSON – ${e.message}`);
    errorCount += 1;
    continue;
  }

  const ok = validate(record);
  if (!ok) {
    console.error(`Line ${lineNum} (type=${record.type ?? "?"}): schema violation`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || "/"} ${err.message}`);
    }
    errorCount += 1;
  }
}

if (errorCount === 0) {
  console.log(
    lineNum === 0
      ? "File is empty – nothing to validate."
      : `All ${lineNum} line${lineNum === 1 ? "" : "s"} are valid.`,
  );
  process.exit(0);
} else {
  console.error(`\n${errorCount} of ${lineNum} line${lineNum === 1 ? "" : "s"} failed validation.`);
  process.exit(1);
}
