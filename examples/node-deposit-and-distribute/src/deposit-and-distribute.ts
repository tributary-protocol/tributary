/**
 * Standalone Node example: simulate subscription payouts via deposit and 
 * scheduled distribute on Stellar testnet using tributary-sdk.
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
  const depositCount = 3;
  console.log(`Simulating ${depositCount} recurring deposits of ${fromStroops(amount)} XLM...`);
  
  for (let i = 1; i <= depositCount; i++) {
    const depositTx = await client.deposit({
      from: payer.publicKey(),
      id: splitId,
      token: XLM_SAC,
      amount,
    });
    const { result: depositResult } = await depositTx.signAndSend();
    if (depositResult.isErr()) {
      throw new Error(`deposit ${i} failed: ${depositResult.unwrapErr().message}`);
    }
    console.log(`  Deposit ${i} complete.`);
  }

  const { result: balanceResult } = await client.balance({
    id: splitId,
    token: XLM_SAC,
  });
  console.log(`Split #${splitId} accumulated balance: ${fromStroops(balanceResult)} XLM`);

  console.log(`Distributing accumulated balance to recipients...`);
  const distributeTx = await client.distribute({
    id: splitId,
    token: XLM_SAC,
  });
  const { result: distributeResult } = await distributeTx.signAndSend();
  if (distributeResult.isErr()) {
    throw new Error(`distribute failed: ${distributeResult.unwrapErr().message}`);
  }
  const distributedAmount = distributeResult.unwrap();
  console.log(`Distributed total of ${fromStroops(distributedAmount)} XLM.`);

  await printBalance(horizon, "recipient A", recipientA.publicKey());
  await printBalance(horizon, "recipient B", recipientB.publicKey());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

