# Event schema reference

Every state-changing entrypoint on the splitter contract emits a
[contract event](https://developers.stellar.org/docs/build/guides/events).
Indexers can subscribe by contract id and follow a single split cheaply,
because the split `id` is always the first data topic.

## Topic and data layout

Each event is published with the Soroban `#[contractevent]` macro. The topic
vector is:

```
topics = [ <event-name-symbol>, <id: u64> ]
```

The event **name** is the struct name converted to `snake_case` (for example
`SplitPaid` -> `split_paid`) and is the first topic. Fields tagged `#[topic]`
(only `id` on every event) follow the name symbol as additional topics. All
remaining fields are serialized into the event **data** as a map keyed by field
name.

## Events

| Event | Name symbol | Topics | Data fields |
|---|---|---|---|
| `SplitCreated`       | `split_created`       | `id: u64` | `creator: Address` |
| `SplitPaid`          | `split_paid`          | `id: u64` | `token: Address`, `amount: i128` |
| `SplitUpdated`       | `split_updated`       | `id: u64` | *(none)* |
| `SplitClosed`        | `split_closed`        | `id: u64` | *(none)* |
| `ControlTransferred` | `control_transferred` | `id: u64` | `new_controller: Option<Address>` |
| `Deposited`          | `deposited`           | `id: u64` | `token: Address`, `amount: i128` |
| `Distributed`        | `distributed`         | `id: u64` | `token: Address`, `amount: i128` |

### `SplitCreated`
Emitted by `create_split` when a new split is registered.
- Topics: `split_created`, `id`
- Data: `creator` — the address that created the split.

### `SplitPaid`
Emitted by `pay`, `pay_many`, and `pay_many_multi` when a payment is routed to
recipients immediately.
- Topics: `split_paid`, `id`
- Data: `token` — the paid asset; `amount` — total amount routed.

### `SplitUpdated`
Emitted by `update_split` when a mutable split's recipients or shares change.
- Topics: `split_updated`, `id`
- Data: none.

### `SplitClosed`
Emitted by `close_split` when a split is closed.
- Topics: `split_closed`, `id`
- Data: none.

### `ControlTransferred`
Emitted by `transfer_control` when the controller is changed. A `new_controller`
of `None` means the split has been locked (immutable).
- Topics: `control_transferred`, `id`
- Data: `new_controller` — `Some(address)` for the new controller, or `None` when locked.

### `Deposited`
Emitted by `deposit` when funds are escrowed for later distribution.
- Topics: `deposited`, `id`
- Data: `token` — deposited asset; `amount` — amount escrowed.

### `Distributed`
Emitted by `distribute` when escrowed funds are paid out to recipients.
- Topics: `distributed`, `id`
- Data: `token` — distributed asset; `amount` — amount paid out.

## Decoding events

Using the TypeScript SDK and `scValToNative`, read the event name from the first
topic, the split id from the second, and the payload from the value map:

```ts
import { scValToNative } from "tributary-sdk";

for (const ev of events) {
  const type = scValToNative(ev.topic[0]);        // e.g. "split_paid"
  const id = ev.topic.length > 1                   // split id
    ? scValToNative(ev.topic[1])
    : undefined;
  const data = scValToNative(ev.value);            // { token, amount } etc.
}
```

Because every event is topic-keyed by split `id`, an indexer can filter the RPC
`getEvents` stream by contract id and follow just one split without decoding the
data map.
