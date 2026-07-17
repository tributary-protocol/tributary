import { Client, networks, Recipient, rpc, scValToNative } from "tributary-sdk";
import {
  requestAccess,
  signTransaction,
  isConnected,
  getNetworkDetails,
} from "@stellar/freighter-api";

export type { Recipient };

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const EXPLORER = "https://stellar.expert/explorer/testnet";
export const CONTRACT_ID = networks.testnet.contractId;

export interface Token {
  code: string;
  contract: string;
}

export const TOKENS: Token[] = [
  {
    code: "XLM",
    contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
  {
    code: "USDC",
    contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  },
];

export const XLM_SAC = TOKENS[0].contract;

export interface SplitView {
  id: bigint;
  recipients: Recipient[];
  shares: number[];
  controller: string | undefined;
}

export function readClient(): Client {
  return new Client({ ...networks.testnet, rpcUrl: RPC_URL });
}

export function walletClient(publicKey: string): Client {
  return new Client({
    ...networks.testnet,
    rpcUrl: RPC_URL,
    publicKey,
    signTransaction,
  });
}

export async function connectWallet(): Promise<string> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    throw new Error("Freighter is not installed. Get it at freighter.app");
  }
  const access = await requestAccess();
  if (access.error) throw new Error(access.error);
  const details = await getNetworkDetails();
  if (!details.error && details.network !== "TESTNET") {
    throw new Error(
      `Freighter is on ${details.network}. Switch it to Testnet and connect again.`,
    );
  }
  return access.address;
}

export async function fetchSplits(limit = 25): Promise<SplitView[]> {
  const client = readClient();
  const { result: count } = await client.split_count();
  const ids: bigint[] = [];
  for (let i = count - 1n; i >= 0n && ids.length < limit; i--) {
    ids.push(i);
  }
  const splits = await Promise.all(
    ids.map(async (id) => {
      const { result } = await client.get_split({ id });
      if (result.isErr()) return null;
      const split = result.unwrap();
      return {
        id,
        recipients: [...split.recipients],
        shares: [...split.shares],
        controller: split.controller,
      };
    }),
  );
  return splits.filter((s): s is SplitView => s !== null);
}

export async function fetchMineIds(creator: string): Promise<Set<string>> {
  const { result } = await readClient().splits_of({ creator });
  return new Set(result.map((id: bigint) => String(id)));
}

export async function previewPayout(
  id: bigint,
  amount: bigint,
): Promise<bigint[]> {
  const { result } = await readClient().preview_payout({ id, amount });
  return result.isErr() ? [] : [...result.unwrap()];
}

export interface ActivityItem {
  eventId: string;
  type: string;
  id: bigint | undefined;
  amount: bigint | undefined;
  token: string | undefined;
  ledger: number;
  txHash: string;
}

export function tokenCode(contract: string | undefined): string {
  if (!contract) return "";
  return TOKENS.find((t) => t.contract === contract)?.code ?? shortAddress(contract);
}

export async function fetchActivity(limit = 12): Promise<ActivityItem[]> {
  const server = new rpc.Server(RPC_URL);
  const latest = await server.getLatestLedger();
  const filters = [
    { type: "contract" as const, contractIds: [CONTRACT_ID] },
  ];

  // getEvents scans at most ~10k ledgers per call, so stay inside one
  // window and page the cursor until we reach the chain head.
  const events = [];
  let cursor: string | undefined;
  for (let page = 0; page < 6; page++) {
    const res = await server.getEvents(
      cursor
        ? { cursor, filters, limit: 100 }
        : {
            startLedger: Math.max(1, latest.sequence - 9_900),
            filters,
            limit: 100,
          },
    );
    events.push(...res.events);
    if (!res.cursor || res.cursor === cursor) break;
    cursor = res.cursor;
    if (!cursor) break;
    const cursorLedger = Number(BigInt(cursor.split("-")[0]) >> 32n);
    if (res.events.length < 100 && cursorLedger >= res.latestLedger) break;
  }

  const items: ActivityItem[] = [];
  for (const ev of events) {
    let type: unknown;
    let id: unknown;
    let amount: bigint | undefined;
    let token: string | undefined;
    try {
      type = scValToNative(ev.topic[0]);
      id = ev.topic.length > 1 ? scValToNative(ev.topic[1]) : undefined;
      const data = scValToNative(ev.value);
      if (data && typeof data === "object" && "amount" in data) {
        amount = data.amount as bigint;
      }
      if (data && typeof data === "object" && "token" in data) {
        token = data.token as string;
      }
    } catch {
      continue;
    }
    if (typeof type !== "string") continue;
    items.push({
      eventId: ev.id,
      type,
      id: typeof id === "bigint" ? id : undefined,
      amount,
      token,
      ledger: ev.ledger,
      txHash: ev.txHash,
    });
  }
  return items.reverse().slice(0, limit);
}

export function recipientLabel(r: Recipient): string {
  return r.tag === "Account"
    ? shortAddress(r.values[0])
    : `split #${String(r.values[0])}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// Stellar classic assets always use 7 decimals through their SAC.
export function toStroops(units: string): bigint {
  const [whole, frac = ""] = units.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded);
}

export function fromStroops(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 7,
  });
}\n

/** Average Stellar ledger close time in seconds. */
const LEDGER_CLOSE_SECS = 5;

/**
 * Convert a ledger sequence number to a relative-time string
 * (e.g. "2 min ago") using the latest known ledger as the reference.
 */
export function relativeTime(ledger: number, latestLedger: number): string {
  const deltaSecs = (latestLedger - ledger) * LEDGER_CLOSE_SECS;
  if (deltaSecs < 0) return "just now";
  if (deltaSecs < 60) return `${deltaSecs}s ago`;
  const mins = Math.floor(deltaSecs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Absolute timestamp estimate for a ledger, used as a tooltip.
 * Approximate: assumes 5-second close times from now.
 */
export function ledgerTimestamp(ledger: number, latestLedger: number): string {
  const deltaSecs = (latestLedger - ledger) * LEDGER_CLOSE_SECS;
  const date = new Date(Date.now() - deltaSecs * 1000);
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
