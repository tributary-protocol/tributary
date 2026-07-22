# tributary-sdk

TypeScript client for the Tributary splitter contract, generated from the on-chain contract spec with `stellar contract bindings typescript` and built on `@stellar/stellar-sdk`.

The client is pre-wired to the testnet deployment. Point it at another network by passing your own `contractId` and `rpcUrl`.

## Install

Install the published package from npm:

```
npm install tributary-sdk
```

Or build it from the repo checkout:

```
cd sdk
npm install
npm run build
```

## Usage

```ts
import { Client, networks } from "tributary-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// read a split
const { result } = await client.get_split({ id: 0n });

// build a create_split transaction, then sign and send it
// with the wallet of your choice
const tx = await client.create_split({
  creator: "G...",
  recipients: ["G...", "G..."],
  shares: [6000, 4000],
  controller: undefined,
});
await tx.signAndSend({ signTransaction });
```

`pay`, `pay_many`, `deposit`, `distribute`, `balance`, `preview_payout`, `update_split`, `transfer_control`, `splits_of` and `split_count` follow the same shape. See `src/index.ts` for the full typed API.

Recipients are tagged variants, either an account or another split:

```ts
recipients: [
  { tag: "Account", values: ["G…"] },
  { tag: "Split", values: [2n] },
],
```

## Configuration

The `Client` constructor accepts a `ClientOptions` object. The most common
fields are:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rpcUrl` | `string` | — | Soroban RPC endpoint (**required**) |
| `networkPassphrase` | `string` | — | Network passphrase (**required**) |
| `contractId` | `string` | — | Splitter contract address (**required**) |
| `publicKey` | `string` | `undefined` | Caller's G… address; needed for write calls |
| `allowHttp` | `boolean` | `false` | Allow non-HTTPS RPC URLs (local dev only) |

The `networks` export provides the correct `networkPassphrase` and
`contractId` for every supported network so you don't have to hard-code them:

```ts
import { Client, networks } from "tributary-sdk";

// Testnet (default)
const testnetClient = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: "G…",           // your wallet address
});

// Mainnet – supply your own RPC and contract ID
const mainnetClient = new Client({
  networkPassphrase: "Public Global Stellar Network ; September 2015",
  contractId: "C…",          // mainnet splitter contract
  rpcUrl: "https://soroban-mainnet.stellar.org",
  publicKey: "G…",
});
```

> **Note:** `rpcUrl` is not bundled inside `networks` because the right
> endpoint depends on whether you're using the public SDF node, a third-party
> provider, or a self-hosted RPC.



## Regenerating

After the contract changes and is redeployed:

```
stellar contract bindings typescript \
  --contract-id <new id> --network testnet --output-dir sdk --overwrite
```

Then restore this readme and the package name in package.json.
