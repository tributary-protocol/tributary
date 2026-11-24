/**
 * Standalone Node example: show a locked split paying royalties across
 * collaborators on Stellar testnet using tributary-sdk.
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

  // Generate 3 collaborators
  const collabA = Keypair.random();
  const collabB = Keypair.random();
  const collabC = Keypair.random();
  
  console.log("Funding 3 collaborator accounts on testnet...");
  await Promise.all([
    server.fundAddress(collabA.publicKey()),
    server.fundAddress(collabB.publicKey()),
    server.fundAddress(collabC.publicKey()),
  ]);

  const signer = contract.basicNodeSigner(payer, networks.testnet.networkPassphrase);
  const client = new Client({
    ...networks.testnet,
    rpcUrl: RPC_URL,
    publicKey: payer.publicKey(),
    signTransaction: signer.signTransaction,
  });

  const recipients: Recipient[] = [
    { tag: "Account", values: [collabA.publicKey()] },
    { tag: "Account", values: [collabB.publicKey()] },
    { tag: "Account", values: [collabC.publicKey()] },
  ];
  
  // E.g., 50% / 30% / 20%
  const shares = sharesFromWeights([50, 30, 20]);

  console.log("Creating a locked (controller: undefined) 50/30/20 royalty split...");
  const createTx = await client.create_split({
    creator: payer.publicKey(),
    recipients,
    shares,
    controller: undefined, // explicit undefined means locked
  });
  
  const { result: createResult } = await createTx.signAndSend();
  if (createResult.isErr()) {
    throw new Error(`create_split failed: ${createResult.unwrapErr().message}`);
  }
  const splitId = createResult.unwrap();
  console.log(`Created locked royalty split #${splitId}`);

  const amount = toStroops(process.env.AMOUNT_XLM ?? "10");
  console.log(`Paying ${fromStroops(amount)} XLM in royalties through split #${splitId}...`);
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
  console.log("Royalty payment distributed.");

  await printBalance(horizon, "Collaborator A (50%)", collabA.publicKey());
  await printBalance(horizon, "Collaborator B (30%)", collabB.publicKey());
  await printBalance(horizon, "Collaborator C (20%)", collabC.publicKey());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

