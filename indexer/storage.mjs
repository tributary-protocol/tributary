import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

function eventKey(event) {
  if (event.id) return `id:${event.id}`;
  return `event:${event.ledger}:${event.txHash ?? ""}:${event.type ?? ""}:${event.split ?? ""}`;
}

function compareEvents(left, right) {
  return (
    Number(left.ledger) - Number(right.ledger) ||
    eventKey(left).localeCompare(eventKey(right))
  );
}

export function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function upsertEvents(path, events) {
  if (events.length === 0) return 0;

  const records = new Map(readEvents(path).map((event) => [eventKey(event), event]));
  const previousSize = records.size;
  for (const event of events) records.set(eventKey(event), event);

  const contents = [...records.values()]
    .sort(compareEvents)
    .map((event) => JSON.stringify(event))
    .join("\n");
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${contents}\n`);
  renameSync(temporaryPath, path);
  return records.size - previousSize;
}
