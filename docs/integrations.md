# Integrating Tributary

Patterns for using splits from another contract or application. All examples use the TypeScript sdk; the same calls work from any Soroban client.

## Marketplace fees

Create one split per seller at onboarding: seller 93%, platform 5%, referrer 2%. On each sale, route the buyer's payment through it:

```ts
await client.pay({ from: buyer, id: sellerSplit, token: USDC, amount });
```

One transaction, three balances updated, nothing to reconcile later.

Settling a day of sales across many sellers batches the same way:

```ts
await client.pay_many({
  from: platform,
  ids: [sellerSplitA, sellerSplitB, sellerSplitC],
  amounts: [12_000_000n, 8_500_000n, 20_000_000n],
  token: USDC,
});
```

## Team payroll pool

Create a mutable split with your multisig as controller and each member as a recipient. Revenue sources `deposit` into it whenever money arrives. Once per month anyone calls `distribute`. Adjusting shares when the team changes is one `update_split` from the controller.

## Referrer pools with nesting

Make the referrer share its own split: the marketplace split routes 2% to `Split(referrerPool)`, and the pool split divides that among active referrers. Updating the referrer roster never touches the marketplace split.

## Reading state

- `preview_payout(id, amount)` tells you the exact cut per recipient before sending, useful for checkout screens.
- `balance(id, token)` shows what is waiting in escrow.
- `splits_of(creator)` lists the split ids an address registered, so your app can find its own splits without an indexer.

### Aggregating balances across splits

Use `splits_of` to find every split a creator registered, then query each one's escrow `balance` for the tokens you care about:

```ts
import { Client, networks } from "tributary-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const creator = "G..." // the address you want to look up

// 1. List every split the creator registered
const { result: splitIds } = await client.splits_of({ creator });
console.log(`${splitIds.length} split(s) found`);

// 2. For each split, check escrow balances for known tokens
const tokens = [
  { code: "XLM",  contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
  { code: "USDC", contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" },
];

let total = 0n;
for (const id of splitIds) {
  for (const { code, contract } of tokens) {
    const { result: bal } = await client.balance({ id, token: contract });
    if (bal > 0n) {
      console.log(`Split #${id}: ${bal} stroops of ${code}`);
      total += bal;
    }
  }
}
console.log(`Aggregate escrow balance: ${total} stroops`);
```

The snippet calls `splits_of` to discover the splits and then iterates over known token contracts with `balance` to sum up what is waiting in escrow. Adjust the `tokens` array and the RPC URL to match your environment.

## Events

Every state change emits an event topic-keyed by split id: `SplitCreated`, `SplitPaid`, `Deposited`, `Distributed`, `SplitUpdated`, `ControlTransferred`. Subscribe through RPC `getEvents` to build payment history or trigger webhooks.
