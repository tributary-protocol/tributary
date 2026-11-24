export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://soroban-testnet.stellar.org",
  contractId:
    process.env.CONTRACT_ID ??
    "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://tributary:tributary@localhost:5432/tributary",
  pollMs: Number(process.env.POLL_MS ?? 10_000),
  reconcileIntervalMs: Number(process.env.RECONCILE_INTERVAL_MS ?? 60_000),
  reconciliationWebhookUrl: process.env.RECONCILIATION_WEBHOOK_URL ?? "",
  port: Number(process.env.PORT ?? 3000),
} as const;
