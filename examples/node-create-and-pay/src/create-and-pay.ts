/**
 * Standalone Node example: create a split and pay through it on Stellar
 * testnet, using only tributary-sdk (no browser wallet).
 *
 * Run with `npm start`. See README.md for the environment variables this
 * script reads.
 */
import {
  Client,
  networks,
  rpc,
  Horizon,
  contract,
  Keypair,
  sharesFromWeights,
  type Recipient,
} from "tributary-sdk";
import { RPC_URL, HORIZON_URL, XLM_SAC, toStroops, fromStroops } from "./amounts.js";

function loadPayer(): { keypair: Keypair; generated: boolean } {
  const secret = process.env.PAYER_SECRET?.trim();
  if (secret) {
    return { keypair: Keypair.fromSecret(secret), generated: false };
  }
  return { keypair: Keypair.random(), generated: true };
}

async function printBalance(
  horizon: InstanceType<typeof Horizon.Server>,
  label: string,
  publicKey: string,
): Promise<void> {
  const account = await horizon.loadAccount(publicKey);
  const native = account.balances.find((b) => b.asset_type === "native");
  console.log(`${label} (${publicKey}) holds ${native?.balance ?? "0"} XLM`);
}

export async function main(): Promise<void> {
  const server = new rpc.Server(RPC_URL);
  const horizon = new Horizon.Server(HORIZON_URL);

  const { keypair: payer, generated } = loadPayer();
  if (generated) {
    console.log(`No PAYER_SECRET set, funding a fresh account: ${payer.publicKey()}`);
    await server.fundAddress(payer.publicKey());
    console.log(`Save this secret to reuse the account next run: ${payer.secret()}`);
  }

  const recipientA = Keypair.random();
  const recipientB = Keypair.random();
  console.log("Funding two recipient accounts on testnet...");
  await Promise.all([
    server.fundAddress(recipientA.publicKey()),
    server.fundAddress(recipientB.publicKey()),
  ]);

  const signer = contract.basicNodeSigner(payer, networks.testnet.networkPassphrase);
  const client = new Client({
    ...networks.testnet,
    rpcUrl: RPC_URL,
    publicKey: payer.publicKey(),
    signTransaction: signer.signTransaction,
  });

  const recipients: Recipient[] = [
    { tag: "Account", values: [recipientA.publicKey()] },
    { tag: "Account", values: [recipientB.publicKey()] },
  ];
  const shares = sharesFromWeights([60, 40]);

  console.log("Creating a 60/40 split...");
  const createTx = await client.create_split({
    creator: payer.publicKey(),
    recipients,
    shares,
    controller: undefined,
  });
  const { result: createResult } = await createTx.signAndSend();
  if (createResult.isErr()) {
    throw new Error(`create_split failed: ${createResult.unwrapErr().message}`);
  }
  const splitId = createResult.unwrap();
  console.log(`Created split #${splitId}`);

  const amount = toStroops(process.env.AMOUNT_XLM ?? "1");
  console.log(`Paying ${fromStroops(amount)} XLM through split #${splitId}...`);
  const payTx = await client.pay({
    from: payer.publicKey(),
    id: splitId,
    token: XLM_SAC,
    amount,
  });
  const { result: payResult } = await payTx.signAndSend();
  if (payResult.isErr()) {
    throw new Error(`pay failed: ${payResult.unwrapErr().message}`);
  }
  console.log("Payment complete.");

  await printBalance(horizon, "recipient A", recipientA.publicKey());
  await printBalance(horizon, "recipient B", recipientB.publicKey());
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
