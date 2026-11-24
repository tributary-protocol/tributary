#!/usr/bin/env node
/**
 * tributary-cli — a tiny CLI wrapping tributary-sdk for quick testing
 * against Stellar testnet.
 *
 * Commands:
 *   create   Create a split between two or more recipients
 *   pay      Pay an existing split
 *   preview  Preview how a payout would be divided, without sending it
 *
 * Run `tributary-cli <command> --help` for command-specific usage.
 */
import { parseArgs } from "node:util";
import {
  Client,
  networks,
  rpc,
  contract,
  Keypair,
  sharesFromWeights,
  type Recipient,
} from "tributary-sdk";
import { RPC_URL, XLM_SAC, toStroops, fromStroops } from "./amounts.js";

const PROGRAM = "tributary-cli";

function topLevelHelp(): string {
  return `Usage: ${PROGRAM} <command> [options]

Commands:
  create    Create a split between two or more recipients
  pay       Pay an existing split
  preview   Preview how a payout would be divided, without sending it

Run '${PROGRAM} <command> --help' for command-specific usage.`;
}

function createHelp(): string {
  return `Usage: ${PROGRAM} create --recipients <G...,G...> --weights <n,n> [options]

Create a split on Stellar testnet.

Options:
  --recipients <list>   Comma-separated recipient public keys (required)
  --weights <list>      Comma-separated positive weights, same length as
                         --recipients (e.g. "60,40"). Converted to basis
                         points internally. (required)
  --source <secret>      Payer secret key. Defaults to $PAYER_SECRET, or a
                         freshly funded random testnet account if unset.
  -h, --help             Show this help message`;
}

function payHelp(): string {
  return `Usage: ${PROGRAM} pay --id <splitId> --amount <XLM> [options]

Pay an existing split with native XLM on Stellar testnet.

Options:
  --id <splitId>    Split id returned by 'create' (required)
  --amount <XLM>    Amount of XLM to pay, e.g. "1.5" (required)
  --source <secret>  Payer secret key. Defaults to $PAYER_SECRET, or a
                     freshly funded random testnet account if unset.
  -h, --help         Show this help message`;
}

function previewHelp(): string {
  return `Usage: ${PROGRAM} preview --id <splitId> --amount <XLM>

Preview how a payout would be divided among a split's recipients,
without sending a transaction. Read-only.

Options:
  --id <splitId>    Split id to preview (required)
  --amount <XLM>    Amount of XLM to preview, e.g. "1.5" (required)
  -h, --help         Show this help message`;
}

function fail(message: string): never {
  console.error(`${PROGRAM}: ${message}`);
  process.exitCode = 1;
  throw new CliExit();
}

class CliExit extends Error {}

function loadPayer(source: string | undefined): { keypair: Keypair; generated: boolean } {
  const secret = (source ?? process.env.PAYER_SECRET)?.trim();
  if (secret) {
    return { keypair: Keypair.fromSecret(secret), generated: false };
  }
  return { keypair: Keypair.random(), generated: true };
}

async function makeClient(payer: Keypair): Promise<Client> {
  const signer = contract.basicNodeSigner(payer, networks.testnet.networkPassphrase);
  return new Client({
    ...networks.testnet,
    rpcUrl: RPC_URL,
    publicKey: payer.publicKey(),
    signTransaction: signer.signTransaction,
  });
}

async function ensureFunded(server: InstanceType<typeof rpc.Server>, payer: Keypair, generated: boolean): Promise<void> {
  if (!generated) return;
  console.log(`No payer secret provided, funding a fresh account: ${payer.publicKey()}`);
  await server.fundAddress(payer.publicKey());
  console.log(`Save this secret to reuse the account next run: ${payer.secret()}`);
}

async function runCreate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      recipients: { type: "string" },
      weights: { type: "string" },
      source: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(createHelp());
    return;
  }

  if (!values.recipients || !values.weights) {
    fail("--recipients and --weights are required. See --help.");
  }

  const recipientKeys = values.recipients!.split(",").map((s) => s.trim()).filter(Boolean);
  const weights = values.weights!.split(",").map((s) => Number(s.trim()));

  if (recipientKeys.length < 2) {
    fail("--recipients must list at least two public keys.");
  }
  if (weights.length !== recipientKeys.length) {
    fail("--weights must have the same number of entries as --recipients.");
  }

  const server = new rpc.Server(RPC_URL);
  const { keypair: payer, generated } = loadPayer(values.source);
  await ensureFunded(server, payer, generated);

  const client = await makeClient(payer);
  const recipients: Recipient[] = recipientKeys.map((key) => ({
    tag: "Account",
    values: [key],
  }));
  const shares = sharesFromWeights(weights);

  const tx = await client.create_split({
    creator: payer.publicKey(),
    recipients,
    shares,
    controller: undefined,
  });
  const { result } = await tx.signAndSend();
  if (result.isErr()) {
    fail(`create_split failed: ${result.unwrapErr().message}`);
  }
  console.log(`Created split #${result.unwrap()}`);
}

async function runPay(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      id: { type: "string" },
      amount: { type: "string" },
      source: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(payHelp());
    return;
  }

  if (!values.id || !values.amount) {
    fail("--id and --amount are required. See --help.");
  }

  const amount = toStroops(values.amount!);
  const server = new rpc.Server(RPC_URL);
  const { keypair: payer, generated } = loadPayer(values.source);
  await ensureFunded(server, payer, generated);

  const client = await makeClient(payer);
  const tx = await client.pay({
    from: payer.publicKey(),
    id: BigInt(values.id!),
    token: XLM_SAC,
    amount,
  });
  const { result } = await tx.signAndSend();
  if (result.isErr()) {
    fail(`pay failed: ${result.unwrapErr().message}`);
  }
  console.log(`Paid ${fromStroops(amount)} XLM through split #${values.id}`);
}

async function runPreview(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      id: { type: "string" },
      amount: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(previewHelp());
    return;
  }

  if (!values.id || !values.amount) {
    fail("--id and --amount are required. See --help.");
  }

  const amount = toStroops(values.amount!);
  // Preview is read-only: any funded keypair can simulate it.
  const { keypair: reader } = loadPayer(undefined);
  const client = await makeClient(reader);

  const tx = await client.preview_payout({ id: BigInt(values.id!), amount });
  if (tx.result.isErr()) {
    fail(`preview_payout failed: ${tx.result.unwrapErr().message}`);
  }
  const parts = tx.result.unwrap();
  parts.forEach((part, i) => {
    console.log(`recipient ${i}: ${fromStroops(part)} XLM`);
  });
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    console.log(topLevelHelp());
    return;
  }

  switch (command) {
    case "create":
      return runCreate(rest);
    case "pay":
      return runPay(rest);
    case "preview":
      return runPreview(rest);
    default:
      fail(`Unknown command "${command}". ${topLevelHelp()}`);
  }
}

main().catch((err) => {
  if (err instanceof CliExit) return;
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});