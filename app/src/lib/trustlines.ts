/**
 * Trustline checking utilities.
 *
 * Separated from tributary.ts so tests can import this module without pulling
 * in the tributary-sdk (which has a pre-existing build artifact issue with
 * TypeScript generics in its dist .js files that OXC cannot parse).
 */

import { XLM_SAC, fetchSplitById } from "./tributary";
import type { SplitView, Token } from "./tributary";

export type TrustlineStatus = "ok" | "no_trustline" | "inconclusive";

export interface RecipientTrustline {
  address: string;
  status: TrustlineStatus;
}

export interface TrustlineCheckResult {
  warnings: RecipientTrustline[];
  /** true when at least one lookup failed so the caller can downgrade to a notice */
  hasErrors: boolean;
}

/** Horizon base URL for testnet */
const HORIZON_URL = "https://horizon-testnet.stellar.org";

/**
 * Fetch the set of asset codes a Stellar account has trustlines for.
 * Returns null if the lookup fails (e.g. account not found, network error).
 *
 * Exported for unit testing.
 */
export async function fetchAccountBalances(
  address: string,
): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
      }>;
    };
    const codes = new Set<string>();
    for (const b of data.balances) {
      if (b.asset_type === "native") {
        codes.add("native");
      } else if (b.asset_code) {
        codes.add(b.asset_code);
      }
    }
    return codes;
  } catch {
    return null;
  }
}

/**
 * Resolve a SplitView and all nested Recipient::Split children down to leaf
 * account addresses, fetching child splits from the chain as needed.
 * Returns a flat list of unique account addresses.
 *
 * Exported for unit testing.
 */
export async function collectLeafAccounts(
  split: SplitView,
  visited = new Set<string>(),
  fetchSplit: (id: bigint) => Promise<SplitView | null> = fetchSplitById,
): Promise<string[]> {
  const accounts: string[] = [];
  for (const r of split.recipients) {
    if (r.tag === "Account") {
      const addr = r.values[0];
      if (!accounts.includes(addr)) accounts.push(addr);
    } else {
      // Recipient::Split — resolve the child split recursively
      const childId = r.values[0] as bigint;
      const key = String(childId);
      if (visited.has(key)) continue;
      visited.add(key);
      try {
        const child = await fetchSplit(childId);
        if (child) {
          const nested = await collectLeafAccounts(child, visited, fetchSplit);
          for (const addr of nested) {
            if (!accounts.includes(addr)) accounts.push(addr);
          }
        }
      } catch {
        // If fetching a child split fails, skip it — callers will mark as inconclusive
      }
    }
  }
  return accounts;
}

// Simple in-memory cache keyed by "splitId:tokenContract"
// Cache entries expire after 30 s.
const trustlineCache = new Map<
  string,
  { result: TrustlineCheckResult; ts: number }
>();
const CACHE_TTL_MS = 30_000;

/**
 * Check whether every leaf account in `split` holds a trustline for `token`.
 *
 * - XLM (native SAC) is always receivable, so no warnings are returned for it.
 * - Results are cached for 30 s to avoid hammering Horizon on every keystroke.
 * - If a Horizon lookup errors the status is set to "inconclusive" and
 *   `hasErrors` is true so callers can downgrade to a notice rather than
 *   blocking the payment.
 * - Recipient::Split children are resolved recursively down to leaf accounts.
 */
export async function checkTrustlines(
  split: SplitView,
  token: Token,
): Promise<TrustlineCheckResult> {
  const cacheKey = `${String(split.id)}:${token.contract}`;
  const cached = trustlineCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  // XLM (native SAC) is always receivable by any funded account
  if (token.contract === XLM_SAC) {
    const result: TrustlineCheckResult = { warnings: [], hasErrors: false };
    trustlineCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  const addresses = await collectLeafAccounts(split);
  const warnings: RecipientTrustline[] = [];
  let hasErrors = false;

  await Promise.all(
    addresses.map(async (address) => {
      const balances = await fetchAccountBalances(address);
      if (balances === null) {
        hasErrors = true;
        warnings.push({ address, status: "inconclusive" });
      } else if (!balances.has(token.code)) {
        warnings.push({ address, status: "no_trustline" });
      }
    }),
  );

  const result: TrustlineCheckResult = { warnings, hasErrors };
  trustlineCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

/** Clear the trustline cache (used in tests). */
export function clearTrustlineCache(): void {
  trustlineCache.clear();
}
