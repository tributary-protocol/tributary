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

### Module / Bundler

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

### Script tag / UMD

For consumers without a bundler, a UMD build is provided via `unpkg` (or any other npm CDN). It exposes all exports on a `Tributary` global variable:

```html
<script src="https://unpkg.com/tributary-sdk/dist/tributary-sdk.umd.js"></script>
<script>
  // The client and networks are available under the Tributary global
  const client = new Tributary.Client({
    ...Tributary.networks.testnet,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  // Example: fetch a split
  client.get_split({ id: 0n }).then(({ result }) => {
    console.log(result);
  });
</script>
```

## Regenerating

After the contract changes and is redeployed:

```
stellar contract bindings typescript \
  --contract-id <new id> --network testnet --output-dir sdk --overwrite
```

Then restore this readme and the package name in package.json.
