<img src="assets/logo.svg" width="72" alt="Tributary">

# Tributary

[![ci](https://github.com/tributary-protocol/tributary/actions/workflows/ci.yml/badge.svg)](https://github.com/tributary-protocol/tributary/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Payment splitting on Stellar. Live at [tributary-omega.vercel.app](https://tributary-omega.vercel.app).

A split is a routing rule stored on-chain: a list of recipient addresses and the share each one gets. Once a split exists, anyone can push a payment through it and every recipient gets paid in the same transaction.

Things you can do with one transfer:

- pay a whole team at once
- route a marketplace sale between seller, platform and referrer
- share donation income between project maintainers
- split royalties between collaborators

## How it works

The splitter contract keeps a registry of splits. Each split holds:

- `recipients`: the addresses that get paid
- `shares`: basis points per recipient, always summing to 10,000
- `controller`: optional. If set, that address can change the recipients and shares later. If left empty, the split is locked forever.

A recipient is either an account address or another split. When a payment reaches a split recipient, that portion is credited to the child split as escrow, and anyone can distribute it onward. This lets you compose routing trees: a project split that feeds team splits, a marketplace split that feeds a referrer pool.

There are two ways money moves through a split:

- `pay` moves an amount of any Stellar asset from the payer straight to all recipients in a single call.
- `deposit` parks funds inside the contract, credited to the split. Anyone can later call `distribute` to pay the whole credited balance out to the recipients. This fits cases where money arrives over time and payouts happen on a schedule.

Per-recipient amounts are rounded down and the leftover dust goes to the last recipient, so the full amount always lands somewhere. `preview_payout` returns the exact cut per recipient before you send anything.

## Contract API

The table below summarizes each call; see [docs/api-reference.md](docs/api-reference.md) for the full per-function reference with parameters, return types, errors, events and auth.

| Function | Description |
| --- | --- |
| `create_split(creator, recipients, shares, controller)` | Registers a split and returns its id |
| `pay(from, id, token, amount)` | Splits a payment across all recipients |
| `pay_many(from, ids, amounts, token)` | Pays several splits in one transaction |
| `deposit(from, id, token, amount)` | Credits funds to the split without paying out |
| `distribute(id, token)` | Pays the credited balance out to all recipients |
| `close_split(id)` | Controller only. Closes an empty split and reclaims storage |
| `preview_payout(id, amount)` | Per-recipient amounts a payment would produce |
| `balance(id, token)` | Credited amount waiting to be distributed |
| `update_split(id, recipients, shares)` | Controller only. Replaces the routing table |
| `transfer_control(id, new_controller)` | Controller only. Hands over control, or locks the split with None |
| `get_split(id)` | Returns a split |
| `splits_of(creator)` | Ids of all splits a creator registered |
| `split_count()` | Number of splits created so far |

## Status

Early days. The core contract works, is tested and runs on testnet, but it is not audited. Do not put serious money through this yet.

## Deployments

| Network | Contract |
| --- | --- |
| Testnet | `CCZXVZUQIZT673QF6ZGLI5AJLEPWUFWVYOPIOJNLNIOO5NI27V4JGJUU` |

## Try it in two minutes

1. Install the [Freighter](https://freighter.app) extension and switch it to Testnet.
2. Fund your account for free at [friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet).
3. Open [tributary-omega.vercel.app](https://tributary-omega.vercel.app), connect, and create a split from the Create tab.
4. Pay through it from the Pay tab and watch both balances land in one transaction.

## Development

You need stable Rust with the `wasm32v1-none` target (the checked-in `rust-toolchain.toml` sets this up automatically).

```bash 
cargo test
cargo build --release --target wasm32v1-none -p tributary-splitter
```

To see the create-then-pay flow end to end without a browser wallet, run the
standalone Node example at
[examples/node-create-and-pay](examples/node-create-and-pay), which creates a
split and pays through it on testnet using `tributary-sdk` directly. `scripts/demo.sh` does the same walkthrough with the Stellar CLI instead.

## Layout

```
contracts/splitter          core splitting contract
sdk                          TypeScript client generated from the contract spec
app                          web dashboard (Vite + React, Freighter wallet)
examples/node-create-and-pay Node script for the create-then-pay flow (no wallet needed)
```

## Roadmap

- Payout history in the dashboard, fed by contract events
- Controller tools in the dashboard: edit, transfer, lock
- Publish the sdk to npm
- Security review, then mainnet

## Docs

[docs/architecture.md](docs/architecture.md) covers the storage layout, money paths, error codes and events in detail.

[docs/glossary.md](docs/glossary.md) defines core terms like split, share, controller, escrow and dust.

[docs/preview-payout.md](docs/preview-payout.md) shows how to preview a payout with `preview_payout` before paying.

[docs/integrations.md](docs/integrations.md#distributing-a-two-level-tree) includes an end-to-end nested split example and shows the multi-call distribution order.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get set up and what a good change looks like.

## License

[Apache-2.0](LICENSE)
