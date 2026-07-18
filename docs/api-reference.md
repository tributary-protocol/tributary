# Contract API reference

Every public entry point of the `tributary-splitter` contract, with its
parameters, return value, the errors it can raise, the event it emits, and its
authorization requirement. Shares are always basis points that must sum to
exactly `TOTAL_SHARES` (10,000); a split has at most `MAX_RECIPIENTS` (32)
recipients. See [architecture.md](./architecture.md) for the model behind these
calls.

## Types

| Type | Definition |
| --- | --- |
| `Recipient` | `Account(Address)` or `Split(u64)` — a payee address or a child split id |
| `Split` | `{ recipients: Vec<Recipient>, shares: Vec<u32>, controller: Option<Address> }` |

## Errors

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `NoRecipients` | recipient/id list was empty |
| 2 | `LengthMismatch` | two paired lists had different lengths |
| 3 | `ZeroShare` | a share was 0 |
| 4 | `BadShareTotal` | shares did not sum to exactly 10,000 |
| 5 | `SplitNotFound` | no split with that id |
| 6 | `SplitImmutable` | split has no controller (locked) |
| 7 | `InvalidAmount` | amount was not strictly positive |
| 8 | `NothingToDistribute` | no credited balance for that token |
| 9 | `TooManyRecipients` | more than 32 recipients |
| 10 | `BadChildSplit` | child split is self-referential or does not exist |
| 11 | `ArithmeticOverflow` | intermediate share math did not fit `i128` (guarded, effectively unreachable) |
| 12 | `SplitHasBalance` | tried to close a split still holding funds |

## State-changing calls

### `create_split(creator, recipients, shares, controller) -> Result<u64, Error>`
Registers a new split and returns its id. `shares` are basis points and must sum
to exactly 10,000. A `Some(controller)` makes the split mutable by that address;
`None` locks it forever.
- **Auth:** `creator`
- **Errors:** `NoRecipients`, `TooManyRecipients`, `LengthMismatch`, `ZeroShare`, `BadShareTotal`, `BadChildSplit`
- **Event:** `SplitCreated { id, creator }`

### `pay(from, id, token, amount) -> Result<(), Error>`
Moves `amount` of `token` from the payer to every recipient of the split in one
call. Rounding dust goes to the last recipient, so amount in equals amount out.
- **Auth:** `from`
- **Errors:** `InvalidAmount`, `SplitNotFound`
- **Event:** `SplitPaid { id, token, amount }`

### `pay_many(from, ids, amounts, token) -> Result<(), Error>`
Pays several splits from one signer in a single transaction. `ids` and `amounts`
pair up positionally; any failure reverts the whole call.
- **Auth:** `from`
- **Errors:** `NoRecipients`, `LengthMismatch`, `InvalidAmount`, `SplitNotFound`
- **Event:** `SplitPaid { id, token, amount }` per split

### `update_split(id, recipients, shares) -> Result<(), Error>`
Replaces the recipients and shares of a mutable split. Controller only.
- **Auth:** the split's `controller`
- **Errors:** `SplitNotFound`, `SplitImmutable`, `NoRecipients`, `TooManyRecipients`, `LengthMismatch`, `ZeroShare`, `BadShareTotal`, `BadChildSplit`
- **Event:** `SplitUpdated { id }`

### `transfer_control(id, new_controller) -> Result<(), Error>`
Hands control of a mutable split to another address, or locks it forever when
`new_controller` is `None`. Controller only.
- **Auth:** the split's current `controller`
- **Errors:** `SplitNotFound`, `SplitImmutable`
- **Event:** `ControlTransferred { id, new_controller }`

### `close_split(id) -> Result<(), Error>`
Closes a split and reclaims its storage. Controller only, and only when the
split holds no balances.
- **Auth:** the split's `controller`
- **Errors:** `SplitNotFound`, `SplitImmutable`, `SplitHasBalance`
- **Event:** `SplitClosed { id }`

### `deposit(from, id, token, amount) -> Result<(), Error>`
Moves funds into the contract and credits them to the split without paying anyone
yet. Credits the amount the vault balance actually increased by (not the
requested `amount`), so fee-on-transfer tokens cannot over-credit the split.
- **Auth:** `from`
- **Errors:** `InvalidAmount`, `SplitNotFound`
- **Event:** `Deposited { id, token, amount }` (only when the received amount is positive)

### `distribute(id, token) -> Result<i128, Error>`
Pays out everything credited to the split for the given token and returns the
amount distributed. Permissionless — the routing table alone decides where funds
go.
- **Auth:** none (anyone may call)
- **Errors:** `SplitNotFound`, `NothingToDistribute`
- **Event:** `Distributed { id, token, amount }`

## Read-only calls

### `preview_payout(id, amount) -> Result<Vec<i128>, Error>`
Returns the exact per-recipient amounts a payment of `amount` would produce,
without moving any funds.
- **Auth:** none
- **Errors:** `InvalidAmount`, `SplitNotFound`

### `balance(id, token) -> i128`
Credited amount waiting to be distributed for the split and token. Returns 0 when
nothing is held.
- **Auth:** none

### `get_split(id) -> Result<Split, Error>`
Returns the split record.
- **Auth:** none
- **Errors:** `SplitNotFound`

### `held_tokens(id) -> Vec<Address>`
Tokens the split currently holds an escrow balance in. Empty when none.
- **Auth:** none

### `splits_of(creator) -> Vec<u64>`
Ids of all splits a creator registered. Empty when none.
- **Auth:** none

### `split_count() -> u64`
Number of splits created so far (also the id the next `create_split` will use).
- **Auth:** none
