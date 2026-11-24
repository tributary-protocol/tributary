const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_CONTRACT_ID =
  "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU";

export function validateConfig(env = process.env) {
  const errors = [];
  const RPC_URL = (env.RPC_URL ?? DEFAULT_RPC_URL).trim();
  const CONTRACT_ID = (env.CONTRACT_ID ?? DEFAULT_CONTRACT_ID).trim();

  if (!RPC_URL) errors.push("RPC_URL is required");
  if (!CONTRACT_ID) errors.push("CONTRACT_ID is required");

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Invalid indexer configuration:\n- ${errors.join("\n- ")}`,
    };
  }

  return { ok: true, value: { RPC_URL, CONTRACT_ID } };
}
