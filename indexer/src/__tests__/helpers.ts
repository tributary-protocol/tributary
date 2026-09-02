import type { NormalizedEvent, EventPayload, EventType } from "../types.js";

let eventCounter = 0;

export function resetCounter(): void {
  eventCounter = 0;
}

export function mockEvent(
  overrides: Partial<NormalizedEvent> & { type: EventType; payload: EventPayload },
): NormalizedEvent {
  eventCounter++;
  return {
    event_id: `test-event-${eventCounter}`,
    ledger: 1000 + eventCounter,
    ledger_closed_at: new Date("2025-01-01T00:00:00Z"),
    tx_hash: `tx-${eventCounter}`,
    split_id: 0,
    ...overrides,
  };
}

export function splitCreatedEvent(
  splitId: number,
  creator = "G_CREATOR",
  recipients = [{ type: "Account" as const, address: "G_RECIPIENT" }],
  shares = [10_000],
): NormalizedEvent {
  return mockEvent({
    type: "SplitCreated",
    split_id: splitId,
    payload: { creator, recipients, shares },
  });
}

export function splitPaidEvent(
  splitId: number,
  token = "G_TOKEN",
  amount = "100000",
): NormalizedEvent {
  return mockEvent({
    type: "SplitPaid",
    split_id: splitId,
    payload: { token, amount, legs: null },
  });
}

export function depositedEvent(
  splitId: number,
  token = "G_TOKEN",
  amount = "50000",
): NormalizedEvent {
  return mockEvent({
    type: "Deposited",
    split_id: splitId,
    payload: { token, amount, source: "external" },
  });
}

export function distributedEvent(
  splitId: number,
  token = "G_TOKEN",
  amount = "50000",
): NormalizedEvent {
  return mockEvent({
    type: "Distributed",
    split_id: splitId,
    payload: { token, amount, legs: null },
  });
}

export function splitUpdatedEvent(
  splitId: number,
  recipients = [{ type: "Account" as const, address: "G_NEW" }],
  shares = [10_000],
): NormalizedEvent {
  return mockEvent({
    type: "SplitUpdated",
    split_id: splitId,
    payload: { recipients, shares },
  });
}

export function controlTransferredEvent(
  splitId: number,
  newController: string | null = null,
): NormalizedEvent {
  return mockEvent({
    type: "ControlTransferred",
    split_id: splitId,
    payload: { new_controller: newController },
  });
}
