import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import {
  type IndexerEvent,
  eventColor,
  eventEmoji,
  formatTypeLabel,
  formatAmount,
  embedFromEvent,
  buildPayload,
} from "./discord-bot.js";

const EVENT_TYPES = [
  "split_created",
  "split_paid",
  "split_updated",
  "split_closed",
  "deposited",
  "distributed",
  "control_transfer_proposed",
  "control_transferred",
] as const;

test("eventColor returns a distinct color for every known event type", () => {
  const colors = EVENT_TYPES.map(eventColor);
  const unique = new Set(colors);
  assert.equal(unique.size, EVENT_TYPES.length);
  assert.equal(eventColor("unknown_type"), 0x95a5a6);
});

test("eventEmoji returns a unique emoji for every known event type", () => {
  const emojis = EVENT_TYPES.map(eventEmoji);
  const unique = new Set(emojis);
  assert.equal(unique.size, EVENT_TYPES.length);
  assert.match(eventEmoji("unknown_type"), /\u2753/);
  assert.match(eventEmoji("split_paid"), /\u{1F4B0}/u);
});

test("formatTypeLabel converts snake_case to Title Case", () => {
  assert.equal(formatTypeLabel("split_created"), "Split Created");
  assert.equal(formatTypeLabel("control_transfer_proposed"), "Control Transfer Proposed");
  assert.equal(formatTypeLabel("deposited"), "Deposited");
});

test("formatAmount handles various input values", () => {
  assert.equal(formatAmount("10000000"), "1");
  assert.equal(formatAmount("15000000"), "1.5");
  assert.equal(formatAmount("10000001"), "1.0000001");
  assert.equal(formatAmount("0"), "0");
  assert.equal(formatAmount(undefined), "\u2014");
  assert.equal(formatAmount(""), "\u2014");
});

test("embedFromEvent formats a split_created event", () => {
  const event: IndexerEvent = {
    ledger: 581235,
    txHash: "d6fcabc123",
    id: "evt-1",
    type: "split_created",
    at: "2026-07-04T12:00:00Z",
    split: "1",
    creator: "GABCDEF123",
  };

  const embed = embedFromEvent(event);
  assert.equal(embed.title.includes("Split Created"), true);
  assert.equal(embed.color, 0x5865f2);
  assert.equal(embed.timestamp, "2026-07-04T12:00:00Z");

  const fieldNames = embed.fields.map((f) => f.name);
  assert.ok(fieldNames.includes("Ledger"));
  assert.ok(fieldNames.includes("Split ID"));
  assert.ok(fieldNames.includes("Creator"));
});

test("embedFromEvent formats a split_paid event with amount", () => {
  const event: IndexerEvent = {
    ledger: 581236,
    txHash: "txhash002",
    id: "evt-2",
    type: "split_paid",
    at: "2026-07-04T12:01:00Z",
    split: "2",
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    amount: "250000000",
  };

  const embed = embedFromEvent(event);
  assert.equal(embed.title.includes("Split Paid"), true);
  assert.equal(embed.color, 0x57f287);

  const amountField = embed.fields.find((f) => f.name === "Amount (XLM)");
  assert.ok(amountField);
  assert.equal(amountField.value, "25");

  const tokenField = embed.fields.find((f) => f.name === "Token");
  assert.ok(tokenField);
  assert.equal(tokenField.value, "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");
});

test("embedFromEvent formats a deposited event", () => {
  const event: IndexerEvent = {
    ledger: 581237,
    type: "deposited",
    split: "3",
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    amount: "50000000",
  };

  const embed = embedFromEvent(event);
  assert.equal(embed.title.includes("Deposited"), true);
  assert.equal(embed.color, 0xeb459e);
});

test("embedFromEvent handles control_transfer_proposed", () => {
  const event: IndexerEvent = {
    ledger: 581238,
    type: "control_transfer_proposed",
    split: "1",
    new_controller: "GXYZ789",
  };

  const embed = embedFromEvent(event);
  assert.equal(embed.title.includes("Control Transfer Proposed"), true);
  const controllerField = embed.fields.find((f) => f.name === "New Controller");
  assert.ok(controllerField);
  assert.match(controllerField.value, /GXYZ789/);
});

test("buildPayload wraps events into a webhook payload", () => {
  const events: IndexerEvent[] = [
    { ledger: 1, type: "split_created", split: "1" },
    { ledger: 2, type: "split_paid", split: "1", amount: "10000000" },
  ];

  const payload = buildPayload(events);
  assert.equal(payload.embeds.length, 2);
  assert.equal(payload.embeds[0].title.includes("Split Created"), true);
  assert.equal(payload.embeds[1].title.includes("Split Paid"), true);
});

test("buildPayload returns empty payload for empty events", () => {
  const payload = buildPayload([]);
  assert.deepEqual(payload, { embeds: [] });
});
