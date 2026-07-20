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

### Transfer control, then lock the split

Control transfers use a two-step handoff: the current controller proposes a new
controller, and the proposed controller accepts. The new controller can then
lock the split by transferring control to `undefined`, the TypeScript encoding
of the contract's `None` value:

```ts
// The current controller proposes the handoff.
const propose = await aliceClient.transfer_control({
  id: payrollSplit,
  new_controller: bob,
});
await propose.signAndSend({ signTransaction: signAsAlice });

// The proposed controller accepts and becomes the current controller.
const accept = await bobClient.accept_control({ id: payrollSplit });
await accept.signAndSend({ signTransaction: signAsBob });

// Only the current controller can lock the split.
const lock = await bobClient.transfer_control({
  id: payrollSplit,
  new_controller: undefined,
});
await lock.signAndSend({ signTransaction: signAsBob });
```

Wait for each transaction to confirm before constructing the next one because
each call depends on the controller state written by the previous call. The
last call sets `controller` to `None` and is irreversible: no address can call
`update_split`, `transfer_control`, or `close_split` afterward. Check the
recipients and shares before locking; a mistaken configuration cannot be
recovered by assigning a new controller.

## Referrer pools with nesting

Make the referrer share its own split: the marketplace split routes 2% to `Split(referrerPool)`, and the pool split divides that among active referrers. Updating the referrer roster never touches the marketplace split.

### Distributing a two-level tree

Nested splits are settled one level per call. A distribution pays account
recipients immediately, but credits split recipients to their own escrow
balances. Call `distribute` again for each credited child to move the funds to
the leaves.

For example, route a 1,000 USDC deposit through this tree:

```text
root
├── 60% → engineering
│   ├── 50% → alice (300)
│   └── 50% → bob   (300)
└── 40% → design
    ├── 75% → carol (300)
    └── 25% → dave  (100)
```

Create children before their parent because a split may only reference an
existing split. The example assumes `client`, `signTransaction`, `creator`,
`payer`, `USDC`, and the four account addresses are already configured:

```ts
const create = async (
  recipients: Parameters<typeof client.create_split>[0]["recipients"],
  shares: number[],
) => {
  const tx = await client.create_split({
    creator,
    recipients,
    shares,
    controller: undefined,
  });
  const { result } = await tx.signAndSend({ signTransaction });
  return result.unwrap();
};

const engineering = await create(
  [
    { tag: "Account", values: [alice] },
    { tag: "Account", values: [bob] },
  ],
  [5_000, 5_000],
);
const design = await create(
  [
    { tag: "Account", values: [carol] },
    { tag: "Account", values: [dave] },
  ],
  [7_500, 2_500],
);
const root = await create(
  [
    { tag: "Split", values: [engineering] },
    { tag: "Split", values: [design] },
  ],
  [6_000, 4_000],
);

const deposit = await client.deposit({
  from: payer,
  id: root,
  token: USDC,
  amount: 1_000n,
});
await deposit.signAndSend({ signTransaction });

// Call 1 empties root and credits 600 to engineering and 400 to design.
const distributeRoot = await client.distribute({ id: root, token: USDC });
await distributeRoot.signAndSend({ signTransaction });

// Calls 2 and 3 empty the children and pay the four account recipients.
const distributeEngineering = await client.distribute({
  id: engineering,
  token: USDC,
});
await distributeEngineering.signAndSend({ signTransaction });

const distributeDesign = await client.distribute({ id: design, token: USDC });
await distributeDesign.signAndSend({ signTransaction });
```

Each `signAndSend` is a separate transaction. Wait for the parent distribution
to confirm before constructing child distributions, so their simulated escrow
balances include the newly credited funds. Calls for sibling children can be
submitted independently after that. Anyone may submit these calls; no payer or
controller signature is required for `distribute`.

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
