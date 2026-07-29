# Tutorial: build a referrer pool with nested splits

This tutorial walks through creating a marketplace that routes sale proceeds
across a seller, a platform fee, and a shared referrer pool — all in one
payment call. It shows how nested splits compose, how to distribute a multi-level
tree, and how to update the referrer roster without touching the marketplace split.

## What you will build

```text
marketplace split
├── 93% → seller          (Account)
├──  5% → platform        (Account)
└──  2% → referrer pool   (Split)
             ├── 50% → referrer_a   (Account)
             └── 50% → referrer_b   (Account)
```

When a buyer pays through the marketplace split:

- The seller and platform receive their share immediately in the same
  transaction.
- The referrer pool's 2% is credited to its escrow balance. A second
  `distribute` call pays referrer\_a and referrer\_b.

Keeping the referrer pool as a child split means you can add or remove
referrers — or change their shares — with one `update_split` call on the pool.
The marketplace split never needs to change.

## Prerequisites

- Node.js 18+ and npm.
- The Tributary TypeScript SDK installed (`npm install tributary-sdk`).
- A funded Stellar testnet identity (use
  [friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet)).
- A wallet that can sign transactions (Freighter or a raw keypair for scripts).

The examples below assume you have already set up a `client` and a
`signTransaction` helper. See [integrations.md](./integrations.md) for a
minimal client setup.

## Step 1 — create the referrer pool

Children must exist before their parents, because a split can only reference
an existing split id. Create the pool first.

```ts
import { Client, networks } from "tributary-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// Accounts involved
const platform  = "G..."; // your platform address (also the tx signer)
const seller    = "G..."; // seller for this listing
const referrerA = "G..."; // first active referrer
const referrerB = "G..."; // second active referrer

// Helper: create a split and return its id.
async function createSplit(
  recipients: Parameters<typeof client.create_split>[0]["recipients"],
  shares: number[],
  controller?: string,
): Promise<bigint> {
  const tx = await client.create_split({
    creator: platform,
    recipients,
    shares,
    controller: controller ?? undefined,
  });
  const { result } = await tx.signAndSend({ signTransaction });
  return result.unwrap();
}

// The referrer pool is mutable so the roster can change later.
const referrerPool = await createSplit(
  [
    { tag: "Account", values: [referrerA] },
    { tag: "Account", values: [referrerB] },
  ],
  [5_000, 5_000],  // 50 / 50
  platform,        // platform controls the pool
);

console.log("referrer pool id:", referrerPool);
```

The pool is created with the platform as controller. That lets you call
`update_split` later to change the referrer roster.

## Step 2 — create the marketplace split

Now wire the marketplace split to the pool created above.

```ts
const marketplaceSplit = await createSplit(
  [
    { tag: "Account", values: [seller] },
    { tag: "Account", values: [platform] },
    { tag: "Split",   values: [referrerPool] },  // child split
  ],
  [9_300, 500, 200],  // 93% / 5% / 2%  — must sum to 10,000
);

console.log("marketplace split id:", marketplaceSplit);
```

The marketplace split is locked (no controller) because its routing should
never change. Only the pool's internals will be updated when referrers come
and go.

## Step 3 — preview the payout

Before accepting real money, confirm the numbers look right with
`preview_payout`. This is a read-only simulation that runs the same rounding
math as `pay`.

```ts
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// A 100 USDC sale (7 decimal places → 1_000_000_000 stroops).
const saleAmount = 1_000_000_000n;

const { result } = await client.preview_payout({
  id: marketplaceSplit,
  amount: saleAmount,
});

if (result.isErr()) throw new Error(result.unwrapErr().toString());

const [sellerCut, platformCut, poolCredit] = [...result.unwrap()];

console.log(`seller:   ${sellerCut}`);    // 930,000,000 stroops (93 USDC)
console.log(`platform: ${platformCut}`);  //   5,000,000 stroops  (5 USDC — dust goes to last by convention)
console.log(`pool:     ${poolCredit}`);   //  20,000,000 stroops  (2 USDC)
```

`preview_payout` returns one value per recipient in recipient order. The seller
and platform amounts land directly; the pool amount is what will be credited to
the referrer pool's escrow.

See [preview-payout.md](./preview-payout.md) for full details on the rounding
behaviour.

## Step 4 — process a sale

When a buyer completes a purchase, call `pay` once. The seller and platform
receive their cuts in the same transaction; the referrer pool's share is
credited to its escrow balance.

```ts
const buyer = "G..."; // the buyer's address (signs the transaction)

const payTx = await client.pay({
  from: buyer,
  id: marketplaceSplit,
  token: USDC,
  amount: saleAmount,
});
await payTx.signAndSend({ signTransaction });

console.log("sale settled in one transaction");
```

After this call:
- `seller` balance: +930,000,000 stroops.
- `platform` balance: +50,000,000 stroops.
- referrer pool escrow: +20,000,000 stroops (waiting to be distributed).

Check the escrow balance any time:

```ts
const { result: poolBalance } = await client.balance({
  id: referrerPool,
  token: USDC,
});
console.log("pool escrow:", poolBalance); // 20_000_000n
```

## Step 5 — distribute the referrer pool

Sales accumulate in the pool's escrow over time. When you are ready to pay out,
call `distribute`. Anyone may call it — no controller or payer signature is
required.

```ts
const distributeTx = await client.distribute({
  id: referrerPool,
  token: USDC,
});
await distributeTx.signAndSend({ signTransaction });

console.log("referrers paid");
// referrer_a: +10,000,000 stroops (50% of 20 USDC)
// referrer_b: +10,000,000 stroops
```

If multiple sales have accumulated in escrow, `distribute` pays the whole
credited balance in one call, proportional to each referrer's share.

## Step 6 — update the referrer roster

A new referrer joined. The marketplace split is untouched; only the pool
changes. The platform (controller) calls `update_split`:

```ts
const referrerC = "G..."; // new referrer

const updateTx = await client.update_split({
  id: referrerPool,
  recipients: [
    { tag: "Account", values: [referrerA] },
    { tag: "Account", values: [referrerB] },
    { tag: "Account", values: [referrerC] },
  ],
  shares: [4_000, 4_000, 2_000], // 40% / 40% / 20% — must sum to 10,000
});
await updateTx.signAndSend({ signTransaction });

console.log("referrer roster updated");
```

From the next sale onward, proceeds flow to the new three-way split. No
existing marketplace split is affected, and the buyer's payment call is
identical.

> **Tip:** distribute the pool before updating the roster so accrued funds
> pay out under the old shares. Funds already in escrow are distributed using
> the shares active at distribute time, not at deposit time.

## How it all fits together

```text
buyer
  │
  └─ pay(marketplaceSplit, USDC, amount)
        │
        ├─ 93% → seller (immediate transfer)
        ├─  5% → platform (immediate transfer)
        └─  2% → referrer pool escrow (held)
                   │
                   └─ distribute(referrerPool, USDC)  ← anyone, any time
                         ├─ 50% → referrer_a (immediate transfer)
                         └─ 50% → referrer_b (immediate transfer)
```

A direct payment (`pay`) settles account recipients in one transaction and
credits split recipients to their escrow. Each escrow level requires its own
`distribute` call, but those calls are permissionless and can be batched or
automated. See [architecture.md](./architecture.md#money-paths) for the full
money-flow diagram.

## What to do next

- **Deeper trees**: a referrer pool can itself contain a sub-split (e.g. a
  referral agency that splits internally). Each additional level adds one
  `distribute` call.
- **Batch sales**: use `pay_many` to settle multiple listings in one
  transaction; each listing can have its own marketplace split.
- **Deposit instead of pay**: if your contract holds sale proceeds before
  routing them, use `deposit` to credit the marketplace split, then call
  `distribute` on it rather than `pay`. Same math, scheduled settlement.
- **Lock the pool**: once a referrer programme is finalised, call
  `transfer_control(referrerPool, None)` to make it immutable.

See [integrations.md](./integrations.md) and
[api-reference.md](./api-reference.md) for the full function signatures and
all available options.
