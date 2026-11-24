import type pg from "pg";
import { contract } from "@stellar/stellar-sdk";
import { getPool } from "./db/pool.js";
import { config } from "./config.js";
import type {
  ReconciliationResult,
  ReconciliationDrift,
  BalanceRow,
  DbEvent,
} from "./types.js";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

async function getClient(): Promise<ReturnType<typeof contract.Client.from>> {
  return contract.Client.from({
    contractId: config.contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}

async function fetchOnChainBalance(splitId: number, token: string): Promise<bigint> {
  try {
    const client = await getClient();
    const tx = await (client as any).balance({
      id: BigInt(splitId),
      token,
    });
    const result = await tx.simulate();
    if (result.result?.ok()) {
      return BigInt(result.result.unwrap());
    }
    return 0n;
  } catch {
    return 0n;
  }
}

async function fetchOnChainSplitCount(): Promise<number> {
  try {
    const client = await getClient();
    const tx = await (client as any).split_count();
    const result = await tx.simulate();
    if (result.result?.ok()) {
      return Number(result.result.unwrap());
    }
    return 0;
  } catch {
    return 0;
  }
}

async function findFirstDivergentEvent(
  pool: pg.Pool,
  splitId: number,
  token: string,
): Promise<number | null> {
  const { rows } = await pool.query<DbEvent>(
    `SELECT id, type, payload FROM events
     WHERE split_id = $1 AND NOT reverted
     ORDER BY id ASC`,
    [splitId],
  );

  let simulatedBalance = 0n;

  for (const ev of rows) {
    const p = ev.payload as unknown as Record<string, unknown>;
    if (ev.type === "Deposited" && p.token === token) {
      simulatedBalance += BigInt(String(p.amount ?? "0"));
    } else if (ev.type === "Distributed" && p.token === token) {
      simulatedBalance -= BigInt(String(p.amount ?? "0"));
    }

    const { rows: balRows } = await pool.query<BalanceRow>(
      "SELECT balance FROM split_balances WHERE split_id = $1 AND token = $2",
      [splitId, token],
    );
    const projectedBalance = BigInt(balRows[0]?.balance ?? "0");

    if (simulatedBalance !== projectedBalance) {
      return ev.id;
    }
  }

  return null;
}

async function postWebhook(drifts: ReconciliationDrift[]): Promise<void> {
  if (!config.reconciliationWebhookUrl || drifts.length === 0) return;

  try {
    await fetch(config.reconciliationWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "reconciliation_drift",
        timestamp: new Date().toISOString(),
        drifts,
      }),
    });
  } catch (err) {
    console.error("reconciliation: webhook failed:", err);
  }
}

export async function reconcile(): Promise<ReconciliationResult> {
  const pool = getPool();
  const drifts: ReconciliationDrift[] = [];

  // 1. Check split_count
  const { rows: splitRows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM splits",
  );
  const projectedCount = Number(splitRows[0]?.count ?? "0");
  const onChainCount = await fetchOnChainSplitCount();

  if (projectedCount !== onChainCount) {
    console.warn(
      `reconciliation: split count mismatch — projected=${projectedCount}, on_chain=${onChainCount}`,
    );
  }

  // 2. Check each (split_id, token) balance pair
  const { rows: balancePairs } = await pool.query<BalanceRow>(
    "SELECT DISTINCT split_id, token FROM split_balances WHERE balance != 0",
  );

  for (const pair of balancePairs) {
    const { rows: projRows } = await pool.query<BalanceRow>(
      "SELECT balance FROM split_balances WHERE split_id = $1 AND token = $2",
      [pair.split_id, pair.token],
    );
    const projected = BigInt(projRows[0]?.balance ?? "0");
    const onChain = await fetchOnChainBalance(pair.split_id, pair.token);

    if (projected !== onChain) {
      const firstEventId = await findFirstDivergentEvent(
        pool,
        pair.split_id,
        pair.token,
      );
      drifts.push({
        split_id: pair.split_id,
        token: pair.token,
        projected: projected.toString(),
        on_chain: onChain.toString(),
        first_divergent_event_id: firstEventId,
      });
    }
  }

  // 3. Update last reconciled timestamp
  await pool.query(
    "UPDATE ingestion_state SET value = $1 WHERE key = 'last_reconciled_at'",
    [new Date().toISOString()],
  );

  const result: ReconciliationResult = {
    status: drifts.length > 0 ? "drift" : "healthy",
    checked: balancePairs.length,
    drifts,
    timestamp: new Date(),
  };

  if (drifts.length > 0) {
    console.warn(`reconciliation: ${drifts.length} drift(s) detected`);
    await postWebhook(drifts);
  } else {
    console.log(`reconciliation: healthy — checked ${balancePairs.length} balance pairs`);
  }

  return result;
}

let reconcileTimer: NodeJS.Timeout | null = null;

export function startReconciliation(): NodeJS.Timeout {
  console.log(
    `reconciliation: running every ${config.reconcileIntervalMs}ms`,
  );
  reconcileTimer = setInterval(
    () => reconcile().catch((e) => console.error(e.message ?? e)),
    config.reconcileIntervalMs,
  );
  return reconcileTimer;
}

export function stopReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
