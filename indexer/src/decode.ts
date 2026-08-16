import { rpc, scValToNative } from "@stellar/stellar-sdk";
import type {
  NormalizedEvent,
  EventType,
  EventPayload,
  Recipient,
} from "./types.js";

type RpcEvent = rpc.Api.EventResponse;

function extractType(topics: unknown[]): EventType | null {
  if (topics.length === 0) return null;
  const raw = scValToNative(topics[0] as never);
  if (typeof raw === "string") return raw as EventType;
  if (typeof raw === "symbol") return String(raw) as EventType;
  return null;
}

function extractSplitId(topics: unknown[]): number | null {
  if (topics.length < 2) return null;
  const raw = scValToNative(topics[1] as never);
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw);
  return null;
}

function bigintSafe(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "bigint" ? String(v) : v;
  }
  return out;
}

function parseRecipients(raw: unknown): Recipient[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    if (r && typeof r === "object") {
      const obj = r as Record<string, unknown>;
      if ("Account" in obj) {
        return { type: "Account" as const, address: String(obj.Account) };
      }
      if ("Split" in obj) {
        const id =
          typeof obj.Split === "bigint" ? Number(obj.Split) : Number(obj.Split as number);
        return { type: "Split" as const, id };
      }
    }
    return { type: "Account" as const, address: String(r) };
  });
}

function decodeSplitCreated(data: Record<string, unknown>): EventPayload {
  return {
    creator: String(data.creator ?? ""),
    recipients: parseRecipients(data.recipients),
    shares: Array.isArray(data.shares)
      ? data.shares.map((s: unknown) => (typeof s === "bigint" ? Number(s) : Number(s)))
      : [],
  };
}

function decodePayoutEvent(data: Record<string, unknown>): EventPayload {
  return {
    token: String(data.token ?? ""),
    amount: String(data.amount ?? "0"),
    legs: null, // Populated by enrichment when #258 lands
  };
}

function decodeDeposited(data: Record<string, unknown>): EventPayload {
  return {
    token: String(data.token ?? ""),
    amount: String(data.amount ?? "0"),
    source: "unknown" as const, // Distinguished when #267 lands
  };
}

function decodeSplitUpdated(data: Record<string, unknown>): EventPayload {
  return {
    recipients: parseRecipients(data.recipients),
    shares: Array.isArray(data.shares)
      ? data.shares.map((s: unknown) => (typeof s === "bigint" ? Number(s) : Number(s)))
      : [],
  };
}

function decodeControlTransferred(data: Record<string, unknown>): EventPayload {
  const nc = data.new_controller;
  return {
    new_controller: nc === null || nc === undefined ? null : String(nc),
  };
}

function decodePayload(type: EventType, data: Record<string, unknown>): EventPayload {
  switch (type) {
    case "SplitCreated":
      return decodeSplitCreated(data);
    case "SplitPaid":
      return decodePayoutEvent(data);
    case "Distributed":
      return decodePayoutEvent(data);
    case "Deposited":
      return decodeDeposited(data);
    case "SplitUpdated":
      return decodeSplitUpdated(data);
    case "ControlTransferred":
      return decodeControlTransferred(data);
  }
}

export function decodeEvent(ev: RpcEvent): NormalizedEvent | null {
  const type = extractType(ev.topic);
  if (!type) return null;

  const splitId = extractSplitId(ev.topic);
  if (splitId === null) return null;

  let data: Record<string, unknown> = {};
  try {
    const decoded = scValToNative(ev.value as never);
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      data = bigintSafe(decoded as Record<string, unknown>);
    }
  } catch {
    // unparseable payload — store empty
  }

  return {
    event_id: ev.id,
    ledger: ev.ledger,
    ledger_closed_at: new Date(ev.ledgerClosedAt),
    tx_hash: ev.txHash,
    type,
    split_id: splitId,
    payload: decodePayload(type, data),
  };
}
