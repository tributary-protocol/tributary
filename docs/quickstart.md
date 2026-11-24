# SDK Quickstart

This guide takes you from a clean machine to your first on-chain call with the
Tributary TypeScript SDK in about five minutes. It covers install, read, and
write (create + pay) against testnet.

The SDK is a generated client for the [splitter contract](../README.md). It is
pre-wired to the testnet deployment, so you only need an account and a way to
sign transactions.

## Prerequisites

- Node.js 18 or newer
- A funded testnet Stellar account. Create one in the
  [Freighter](https://freighter.app) wallet, then fund it at
  [friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet).
- A signing function. The snippets below use a minimal inline signer built on
  `@stellar/stellar-sdk`; in a real app you would route this through a wallet
  like Freighter or a backend key manager.

## Install

```bash
npm install tributary-sdk
```

Or build it from this repo checkout:

```bash
cd sdk
npm install
npm run build
```

## Read-only call

Reading a split does not require signing. Point the client at the testnet
network and call `get_split`:

```ts
import { Client, networks } from "tributary-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// Splits are numbered from 0.
const { result } = await client.get_split({ id: 0n });
console.log(result);
```

`result` is a `Split`:

```ts
type Split = {
  controller: string | null;
  recipients: Array<{ tag: "Account"; values: [string] } | { tag: "Split"; values: [bigint] }>;
  shares: Array<number>;
};
```

## Your first write: create a split

Writes go through `signAndSend`, which simulates the transaction, then signs and
submits it. The example below builds a signer from a secret key. **Never ship a
hardcoded key** — this is for the quickstart only.

```ts
import { Client, networks, contract, rpc } from "tributary-sdk";
import { Keypair } from "@stellar/stellar-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const keypair = Keypair.fromSecret("S..."); // your testnet secret key
const publicKey = keypair.publicKey();

const signTransaction = async (tx: string) => {
  const prepared = rpc.assembledTransactionFromXDR(tx, networks.testnet.networkPassphrase);
  prepared.sign(keypair);
  return prepared.toEnvelope().toXDR().toString("base64");
};

// 60% / 40% split between two accounts.
const tx = await client.create_split({
  creator: publicKey,
  recipients: [
    { tag: "Account", values: [publicKey] },
    { tag: "Account", values: ["G..."] },
  ],
  shares: [6000, 4000],
  controller: undefined, // undefined locks the split forever
});

const { result } = await tx.signAndSend({ signTransaction });
console.log("created split id", result); // a bigint
```

`result` is the new split's id. Shares are basis points and must sum to exactly
`10_000`; `controller` is `undefined` to lock the split, or an address string to
make it editable later.

## Pay through the split

Pushing a payment through the split pays every recipient in one transaction.
Preview the per-recipient amounts first with `preview_payout`, then `pay`:

```ts
// Exact per-recipient amounts for a 1000-unit payment, no funds moved.
const { result: preview } = await client.preview_payout({ id: result, amount: 1000n });
console.log(preview); // e.g. [600n, 400n]

const payTx = await client.pay({
  from: publicKey,
  id: result,
  token: "CAS3J7ZYVA3TBXEEZUWEXZYYH2F2LJGV7YQHVWPCLA7QZOKMVFSVWJQP", // a testnet asset
  amount: 1000n,
});
await payTx.signAndSend({ signTransaction });
```

The payer must hold and have authorized the `token`. For a USDC-like asset on
testnet you typically need to set a trustline and grant the contract a spending
allowance first; the dashboard's Pay tab performs these steps for you.

## Where to go next

- [SDK README](../sdk/README.md) for the full method list and regenerating bindings.
- [Architecture](../docs/architecture.md) for storage layout, money paths, and error codes.
- [Glossary](../docs/glossary.md) for split, share, controller, escrow, and dust.
- [README](../README.md) for the two-minute web walkthrough and deployments.
