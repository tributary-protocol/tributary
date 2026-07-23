import { createServer, parseLedgerRange, replayRange } from "./replay.mjs";

const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID =
  process.env.CONTRACT_ID ?? "CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU";
const OUT = process.env.OUT ?? "events.ndjson";

try {
  const { startLedger, endLedger } = parseLedgerRange(
    process.argv[2],
    process.argv[3],
  );
  const result = await replayRange({
    server: createServer(RPC_URL),
    contractId: CONTRACT_ID,
    out: OUT,
    startLedger,
    endLedger,
  });
  console.log(
    `replayed ledgers ${startLedger}-${endLedger}: ${result.fetched} events fetched, ${result.inserted} inserted`,
  );
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
}
