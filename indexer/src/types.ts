export type EventType =
  | "SplitCreated"
  | "SplitPaid"
  | "SplitUpdated"
  | "ControlTransferred"
  | "Deposited"
  | "Distributed";

export interface Recipient {
  type: "Account" | "Split";
  address?: string;
  id?: number;
}

export interface PayoutLeg {
  recipient: string;
  share_bps: number;
  leg_amount: string;
}

export interface SplitCreatedPayload {
  creator: string;
  recipients: Recipient[];
  shares: number[];
}

export interface SplitPaidPayload {
  token: string;
  amount: string;
  legs: PayoutLeg[] | null;
}

export interface DepositedPayload {
  token: string;
  amount: string;
  source: "external" | "nested_routing" | "unknown";
}

export interface DistributedPayload {
  token: string;
  amount: string;
  legs: PayoutLeg[] | null;
}

export interface SplitUpdatedPayload {
  recipients: Recipient[];
  shares: number[];
}

export interface ControlTransferredPayload {
  new_controller: string | null;
}

export type EventPayload =
  | SplitCreatedPayload
  | SplitPaidPayload
  | DepositedPayload
  | DistributedPayload
  | SplitUpdatedPayload
  | ControlTransferredPayload;

export interface NormalizedEvent {
  event_id: string;
  ledger: number;
  ledger_closed_at: Date;
  tx_hash: string;
  type: EventType;
  split_id: number;
  payload: EventPayload;
}

export interface DbEvent {
  id: number;
  event_id: string;
  ledger: number;
  ledger_closed_at: Date;
  tx_hash: string;
  type: EventType;
  split_id: number;
  payload: EventPayload;
  reverted: boolean;
  ingested_at: Date;
}

export interface SplitRow {
  id: number;
  creator: string;
  recipients: Recipient[];
  shares: number[];
  controller: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BalanceRow {
  split_id: number;
  token: string;
  balance: string;
  updated_at: Date;
}

export interface PayoutRow {
  id: number;
  split_id: number;
  token: string;
  total_amount: string;
  recipient: string;
  share_bps: number;
  leg_amount: string;
  tx_hash: string;
  ledger: number;
  timestamp: Date;
}

export interface EarningsRow {
  address: string;
  token: string;
  total_earned: string;
  payout_count: number;
  last_payout_at: Date | null;
}

export interface IngestionCursor {
  cursor: string;
  latestLedger: number;
}

export interface ReconciliationDrift {
  split_id: number;
  token: string;
  projected: string;
  on_chain: string;
  first_divergent_event_id: number | null;
}

export interface ReconciliationResult {
  status: "healthy" | "drift";
  checked: number;
  drifts: ReconciliationDrift[];
  timestamp: Date;
}
