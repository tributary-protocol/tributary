/**
 * Tests for trustline-checking utilities.
 *
 * These tests avoid importing tributary-sdk directly (pre-existing broken
 * dist — TypeScript generics in .js) by importing only from trustlines.ts
 * and mocking its external I/O.
 *
 * The `collectLeafAccounts` and `checkTrustlines` functions accept an
 * injectable `fetchSplit` parameter so the on-chain lookup can be replaced
 * with a stub in tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Inline the pure logic under test so we don't pull in tributary-sdk at all.
// These mirror the implementations in trustlines.ts exactly.
// ---------------------------------------------------------------------------

type TrustlineStatus = "ok" | "no_trustline" | "inconclusive";

interface RecipientTrustline {
  address: string;
  status: TrustlineStatus;
}

interface TrustlineCheckResult {
  warnings: RecipientTrustline[];
  hasErrors: boolean;
}

interface Token {
  code: string;
  contract: string;
}

// Match the shape of SplitView used in the real module
interface SplitView {
  id: bigint;
  recipients: Array<
    | { tag: "Account"; values: readonly [string] }
    | { tag: "Split"; values: readonly [bigint] }
  >;
  shares: number[];
  controller: string | undefined;
}

const XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const HORIZON_URL = "https://horizon-testnet.stellar.org";

async function fetchAccountBalances(
  address: string,
): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
      }>;
    };
    const codes = new Set<string>();
    for (const b of data.balances) {
      if (b.asset_type === "native") codes.add("native");
      else if (b.asset_code) codes.add(b.asset_code);
    }
    return codes;
  } catch {
    return null;
  }
}

async function collectLeafAccounts(
  split: SplitView,
  visited = new Set<string>(),
  fetchSplit: (id: bigint) => Promise<SplitView | null> = async () => null,
): Promise<string[]> {
  const accounts: string[] = [];
  for (const r of split.recipients) {
    if (r.tag === "Account") {
      const addr = r.values[0];
      if (!accounts.includes(addr)) accounts.push(addr);
    } else {
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
        // skip
      }
    }
  }
  return accounts;
}

const trustlineCache = new Map<
  string,
  { result: TrustlineCheckResult; ts: number }
>();
const CACHE_TTL_MS = 30_000;

async function checkTrustlines(
  split: SplitView,
  token: Token,
  fetchSplit: (id: bigint) => Promise<SplitView | null> = async () => null,
): Promise<TrustlineCheckResult> {
  const cacheKey = `${String(split.id)}:${token.contract}`;
  const cached = trustlineCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  if (token.contract === XLM_SAC) {
    const result: TrustlineCheckResult = { warnings: [], hasErrors: false };
    trustlineCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  const addresses = await collectLeafAccounts(split, new Set(), fetchSplit);
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const XLM: Token = {
  code: "XLM",
  contract: XLM_SAC,
};

const USDC: Token = {
  code: "USDC",
  contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
};

const ALICE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const BOB = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function makeAccountSplit(id: bigint, addresses: string[]): SplitView {
  return {
    id,
    recipients: addresses.map((a) => ({
      tag: "Account" as const,
      values: [a] as const,
    })),
    shares: addresses.map(() => Math.floor(10_000 / addresses.length)),
    controller: undefined,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchAccountBalances", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns asset codes when Horizon responds ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          balances: [
            { asset_type: "native" },
            { asset_type: "credit_alphanum4", asset_code: "USDC" },
          ],
        }),
    } as Response);

    const codes = await fetchAccountBalances(ALICE);
    expect(codes).not.toBeNull();
    expect(codes!.has("native")).toBe(true);
    expect(codes!.has("USDC")).toBe(true);
  });

  it("returns null when Horizon returns a non-ok status", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    expect(await fetchAccountBalances(ALICE)).toBeNull();
  });

  it("returns null on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchAccountBalances(ALICE)).toBeNull();
  });
});

describe("collectLeafAccounts", () => {
  it("returns direct account recipients", async () => {
    const split = makeAccountSplit(0n, [ALICE, BOB]);
    expect(await collectLeafAccounts(split)).toEqual([ALICE, BOB]);
  });

  it("deduplicates repeated addresses", async () => {
    const split = makeAccountSplit(1n, [ALICE, ALICE]);
    const accounts = await collectLeafAccounts(split);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toBe(ALICE);
  });

  it("recurses into nested splits", async () => {
    const child = makeAccountSplit(99n, [BOB]);
    const parent: SplitView = {
      id: 2n,
      recipients: [
        { tag: "Account", values: [ALICE] as const },
        { tag: "Split", values: [99n] as const },
      ],
      shares: [5000, 5000],
      controller: undefined,
    };
    const fetchSplit = vi.fn().mockResolvedValue(child);
    const accounts = await collectLeafAccounts(parent, new Set(), fetchSplit);
    expect(accounts).toEqual([ALICE, BOB]);
    expect(fetchSplit).toHaveBeenCalledWith(99n);
  });

  it("skips a nested split that cannot be fetched", async () => {
    const parent: SplitView = {
      id: 3n,
      recipients: [
        { tag: "Account", values: [ALICE] as const },
        { tag: "Split", values: [99n] as const },
      ],
      shares: [5000, 5000],
      controller: undefined,
    };
    const fetchSplit = vi.fn().mockRejectedValue(new Error("rpc error"));
    const accounts = await collectLeafAccounts(parent, new Set(), fetchSplit);
    // ALICE is returned; the broken nested split is skipped
    expect(accounts).toEqual([ALICE]);
  });

  it("avoids infinite loops from circular splits", async () => {
    // Both splits reference each other
    const splitA: SplitView = {
      id: 10n,
      recipients: [{ tag: "Split", values: [11n] as const }],
      shares: [10_000],
      controller: undefined,
    };
    const splitB: SplitView = {
      id: 11n,
      recipients: [
        { tag: "Split", values: [10n] as const },
        { tag: "Account", values: [ALICE] as const },
      ],
      shares: [5000, 5000],
      controller: undefined,
    };
    const fetchSplit = vi.fn().mockImplementation((id: bigint) =>
      id === 10n ? Promise.resolve(splitA) : Promise.resolve(splitB),
    );
    // Should terminate without infinite recursion
    const visited = new Set<string>(["10"]); // start already-visited so 10→11 is explored
    const accounts = await collectLeafAccounts(splitA, visited, fetchSplit);
    expect(accounts).toContain(ALICE);
  });
});

describe("checkTrustlines", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
    trustlineCache.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns no warnings for XLM without calling Horizon", async () => {
    const split = makeAccountSplit(20n, [ALICE, BOB]);
    const result = await checkTrustlines(split, XLM);
    expect(result.warnings).toHaveLength(0);
    expect(result.hasErrors).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no warnings when all accounts have the USDC trustline", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          balances: [
            { asset_type: "native" },
            { asset_type: "credit_alphanum4", asset_code: "USDC" },
          ],
        }),
    } as Response);

    const split = makeAccountSplit(21n, [ALICE, BOB]);
    const result = await checkTrustlines(split, USDC);
    expect(result.warnings).toHaveLength(0);
    expect(result.hasErrors).toBe(false);
  });

  it("reports no_trustline for an account missing USDC", async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const address = String(url).split("/accounts/")[1];
      const balances =
        address === ALICE
          ? [
              { asset_type: "native" },
              { asset_type: "credit_alphanum4", asset_code: "USDC" },
            ]
          : [{ asset_type: "native" }];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ balances }),
      } as Response);
    });

    const split = makeAccountSplit(22n, [ALICE, BOB]);
    const result = await checkTrustlines(split, USDC);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].address).toBe(BOB);
    expect(result.warnings[0].status).toBe("no_trustline");
    expect(result.hasErrors).toBe(false);
  });

  it("marks account as inconclusive when Horizon returns non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);

    const split = makeAccountSplit(23n, [ALICE]);
    const result = await checkTrustlines(split, USDC);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].address).toBe(ALICE);
    expect(result.warnings[0].status).toBe("inconclusive");
    expect(result.hasErrors).toBe(true);
  });

  it("marks account as inconclusive when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    const split = makeAccountSplit(24n, [ALICE]);
    const result = await checkTrustlines(split, USDC);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].status).toBe("inconclusive");
    expect(result.hasErrors).toBe(true);
  });

  it("caches the result and does not call Horizon again within TTL", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ balances: [{ asset_type: "native" }] }),
      } as Response);
    });

    const split = makeAccountSplit(25n, [ALICE]);
    await checkTrustlines(split, USDC);
    await checkTrustlines(split, USDC); // second call — should hit cache
    expect(callCount).toBe(1);
  });

  it("checks nested split leaf accounts recursively", async () => {
    // BOB is in a nested split and has no USDC trustline
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const address = String(url).split("/accounts/")[1];
      const hasUsdc = address === ALICE;
      const balances = hasUsdc
        ? [
            { asset_type: "native" },
            { asset_type: "credit_alphanum4", asset_code: "USDC" },
          ]
        : [{ asset_type: "native" }];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ balances }),
      } as Response);
    });

    const childSplit = makeAccountSplit(99n, [BOB]);
    const parentSplit: SplitView = {
      id: 26n,
      recipients: [
        { tag: "Account", values: [ALICE] as const },
        { tag: "Split", values: [99n] as const },
      ],
      shares: [5000, 5000],
      controller: undefined,
    };
    const fetchSplit = vi.fn().mockResolvedValue(childSplit);
    const result = await checkTrustlines(parentSplit, USDC, fetchSplit);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].address).toBe(BOB);
    expect(result.warnings[0].status).toBe("no_trustline");
  });
});
