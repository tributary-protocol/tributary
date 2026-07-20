# Preview a payout before paying

`preview_payout` lets you see exactly how an amount would be split across a
split's recipients **without** moving any funds. It runs the same rounding math
as `pay` (each recipient gets `floor(amount * share / TOTAL_SHARES)`, with any
rounding dust going to the last recipient), so the numbers you preview are the
numbers that will be paid.

Use it to show a confirmation screen, validate expectations in a script, or
sanity-check a split's shares before sending real value.

## Signature

```rust
// contract
pub fn preview_payout(env: Env, id: u64, amount: i128) -> Result<Vec<i128>, Error>
```

- `id` — the split to preview.
- `amount` — a **positive** amount in the token's base units (stroops for
  7-decimal Stellar assets). A non-positive amount returns `Error::InvalidAmount`.
- Returns one amount per recipient, in the split's recipient order. The returned
  amounts always sum to exactly `amount` (conservation holds; the last recipient
  absorbs any rounding dust).

It is a **read-only** call — no authorization, no state change — so you can
simulate it freely against a public RPC.

## SDK example

The TypeScript SDK exposes `preview_payout` and returns a `Result` you unwrap.
The app helper wraps it:

```ts
import { Client, networks } from "tributary-sdk";

const client = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// Preview splitting 100.0000000 units (1_000_000_000 stroops) across split #7.
const amount = 1_000_000_000n;
const { result } = await client.preview_payout({ id: 7n, amount });

if (result.isErr()) {
  console.error("preview failed:", result.unwrapErr());
} else {
  const parts = [...result.unwrap()];
  // parts[i] is what recipient i receives; they sum to `amount`.
  const total = parts.reduce((a, b) => a + b, 0n);
  console.log("per-recipient:", parts.map(String));
  console.log("sum:", total.toString(), "==", amount.toString());
}
```

The bundled dashboard uses exactly this pattern in its pay flow. See
`app/src/lib/tributary.ts` (`previewPayout`) and `app/src/components/PaySplit.tsx`,
where the previewed amounts are rendered next to each recipient before the user
confirms the transaction:

```ts
export async function previewPayout(id: bigint, amount: bigint): Promise<bigint[]> {
  const { result } = await readClient().preview_payout({ id, amount });
  return result.isErr() ? [] : [...result.unwrap()];
}
```

## Notes

- Because `preview_payout` mirrors `pay`'s rounding, previewing then paying the
  same `amount` yields the same per-recipient values.
- Convert human units to base units before calling (e.g. `toStroops("100")` for a
  7-decimal asset), and back with `fromStroops` for display.
