# Architecture

Tributary is three pieces: a Soroban contract that owns all the money movement, a generated TypeScript client, and a web dashboard. The contract is the source of truth; everything else is a view on it.

## The splitter contract

One contract instance manages every split. A split is a small record:

| Field | Type | Meaning |
| --- | --- | --- |
| `recipients` | `Vec<Recipient>` | who gets paid, max 32 entries |
| `shares` | `Vec<u32>` | basis points per recipient, sum exactly 10,000 |
| `controller` | `Option<Address>` | who may edit the split; `None` means locked forever |

A `Recipient` is either `Account(Address)` or `Split(u64)`. Split recipients let routing compose: the child's portion is credited to its escrow balance rather than transferred onward immediately, which keeps a single payment bounded no matter how deep the tree goes. Distributing the child is a separate, permissionless call. A split cannot reference itself or a split that does not exist yet; deeper cycles built through later updates are possible but harmless, since money only ever moves between balances when someone calls `distribute`.

### Storage layout

| Key | Storage | Value |
| --- | --- | --- |
| `Count` | instance | next split id (`u64`) |
| `Split(id)` | persistent | the split record |
| `Balance(id, token)` | persistent | escrowed amount per split and token (`i128`) |
| `Created(creator)` | persistent | ids created by an address (`Vec<u64>`) |

Persistent entries get their TTL extended to about 120 days whenever a split is loaded, with a 30 day threshold, so active splits never expire from the ledger.

### Money paths

```mermaid
flowchart TB
    subgraph Pay[Direct Payment - pay]
        P1[Payer] -- "pay(id, token, amount)" --> C[Splitter Contract]
        C -- "per-share transfer" --> A1[Account Recipient]
        C -- "transfer to vault + credit" --> CB[Child Split Balance]
    end

    subgraph Escrow[Deposit & Distribute]
        P2[Payer] -- "deposit(id, token, amount)" --> C
        C -- "credit" --> B[Balance(id, token)]
        B -- "distribute(id, token)" --> C
        C -- "per-share transfer" --> A2[Account Recipient]
        C -- "credit" --> CB2[Child Split Balance]
    end

    subgraph Nested[Nested Split Routing]
        CB -- "distribute(child, token)" --> C
        CB2 -- "distribute(child, token)" --> C
        C -- "per-share transfer" --> L1[Leaf Account]
        C -- "credit" --> GC[Grandchild Balance]
    end
```

Direct payment: `pay(from, id, token, amount)` transfers from the payer to every recipient inside one invocation. Nothing is held.

Escrow: `deposit(from, id, token, amount)` moves funds into the contract and credits `Balance(id, token)`. `distribute(id, token)` later pays the whole credited balance out following the split's shares. Distribution is permissionless because the routing table alone decides where funds go.

Because distribution trusts whatever routing table is on the split at that moment, `update_split` refuses to run while `held_tokens(id)` is non-empty for a mutable split: a controller cannot accept a deposit under one set of recipients and pay it out under another. The controller must call `distribute` for every held token before changing recipients or shares. Immutable splits (`controller: None`) never had this exposure, since their routing table can't change at all.

Both paths round each recipient's amount down and give the leftover to the last recipient, so the amount in always equals the amount out.

### Two-step control transfer

For a mutable split, `transfer_control(id, Some(new_controller))` records the
address as `pending_controller(id)` instead of changing `controller`
immediately. The current controller must authorize the proposal, and the
proposed controller must later authorize `accept_control(id)` before the
handoff takes effect. This two-step flow prevents an address from being made
responsible for a split without its consent and avoids losing control to a
mistyped or inaccessible address.

While a proposal is pending, the current controller remains in control and may
remove it with `cancel_transfer(id)`. A new proposal replaces the pending
address. After acceptance, the pending entry is removed and the accepted
address becomes the controller.

For example, if Alice proposes Bob, `pending_controller(id)` returns Bob but
Alice can still update or close the split. Bob becomes controller only after he
calls `accept_control(id)`. If Alice notices that the proposed address is
wrong, she can cancel it before Bob accepts. Passing `None` to
`transfer_control` is different: it immediately removes the controller, with
no acceptance step. It does not clear an existing pending proposal, so that
address can still accept and restore control afterward. A controller that
intends to lock a split permanently must cancel any pending proposal before
passing `None`.

### Bounded distribution helpers

`distribute_cascade(id, token, max_depth)` drains the selected split and then
recursively drains child-split balances credited by that distribution. Depth
zero distributes only the selected split. Each increment permits one more
child edge, up to `MAX_CASCADE_DEPTH` (5); larger values fail with
`MaxDepthExceeded`. A child with no balance is skipped, while an empty balance
on the selected root returns `NothingToDistribute`. The bound keeps recursive
storage operations and token transfers within a predictable limit; callers can
invoke the helper again on a deeper child when a tree exceeds it.

`distribute_all_tokens(id, tokens)` drains several token balances for one split
without traversing child splits. Callers may provide a token list or pass
`None` to use every token currently recorded by `held_tokens(id)`. At most
`MAX_DISTRIBUTE_TOKENS` (10) tokens may be supplied or discovered; a longer
list fails with `TooManyTokens` before any token is processed. Zero-balance
tokens within an accepted list are skipped. Trees that need both dimensions use
`distribute_all_tokens` per node or call `distribute_cascade` separately for
each token.

### Maximum safe payment amount

Share math is `amount * share / 10_000`, computed in 256-bit space
(`I256`) since the i128-overflow fix (#42, PR #196). The final slice
is always `<= amount` because every `share <= 10_000`, so the result fits
back into `i128` and never panics or wraps.

The only overflow risk is the **intermediate product** `amount * share`. Given
the largest `share` in a split, the largest fully-safe `amount` is:

```
max_safe_amount = floor(i128::MAX / largest_share)
```

For a single-recipient split (`largest_share = 10_000`) that is
`i128::MAX / 10_000`. Payers are not blocked above this — the contract
computes in 256-bit and only the last recipient's dust can approach `i128`
on division — but `max_safe_amount` is the documented, test-pinned ceiling
for which every recipient slice is exact and conservation holds with no wrap.

### Errors

### Errors

The `Error` enum is `#[contracterror]` with `#[repr(u32)]`, so each variant
surfaces to callers as a numeric code. The full per-variant docs live in
`contracts/splitter/src/lib.rs`; the table below is the integrator reference.

| Code | Name | Meaning | Raised by |
| --- | --- | --- | --- |
| 1 | `NoRecipients` | recipient list is empty | `create_split`, `update_split` (via `validate`), `pay_many` (empty `ids`) |
| 2 | `LengthMismatch` | `recipients` and `shares` differ in length | `create_split`, `update_split` (via `validate`), `pay_many` (mismatched `ids`/`amounts`) |
| 3 | `ZeroShare` | a share value is `0` | `create_split`, `update_split` (via `validate`) |
| 4 | `BadShareTotal` | shares do not sum to `TOTAL_SHARES` (10,000), or the sum overflows `u32` | `create_split`, `update_split` (via `validate`) |
| 5 | `SplitNotFound` | the split `id` does not exist in storage | `pay`, `pay_many`, `update_split`, `transfer_control`, `distribute`, `preview_payout`, `get_split` (all via `load`) |
| 6 | `SplitImmutable` | an edit was attempted on a split with `controller == None` | `update_split`, `transfer_control` |
| 7 | `InvalidAmount` | the payment amount is zero or negative | `pay`, `pay_many`, `deposit`, `preview_payout` |
| 8 | `NothingToDistribute` | `distribute` called on a split/token with an empty escrow balance | `distribute` |
| 9 | `TooManyRecipients` | more than `MAX_RECIPIENTS` (32) recipients supplied | `create_split`, `update_split` (via `validate`) |
| 10 | `BadChildSplit` | a `Recipient::Split(child)` reference is unknown, or a split references itself | `create_split`, `update_split` (via `validate`) |
| 12 | `SplitHasBalance` | the split still holds an escrow balance in some token | `close_split`, `update_split` |

`validate` is the shared gate for `create_split` and `update_split`; it raises
codes 1–4, 9, and 10. `load` is the shared gate for every call that
takes a split `id`; it raises code 5.

### Events

`SplitCreated`, `SplitPaid`, `SplitUpdated`, `ControlTransferred`, `Deposited` and `Distributed`, each topic-keyed by split id so an indexer can follow one split cheaply.

## The sdk

`sdk/` is generated from the deployed contract spec with `stellar contract bindings typescript`. It is regenerated whenever the contract interface changes and the new deployment replaces the address embedded in `networks`.

## The app

`app/` is a Vite and React client. Reads go through RPC simulation and need no wallet. Writes build a transaction with the sdk, get signed by Freighter and are submitted to testnet.
