# Deploy Your Own Splitter

This guide walks through building the splitter contract from source and
deploying it to the Stellar testnet with the
[Stellar CLI](https://developers.stellar.org/docs/tools/cli). By the end you
will have your own contract instance, and the SDK regenerated to point at it.

The whole flow is wrapped in [`scripts/deploy.sh`](../scripts/deploy.sh); this
page explains each step so you can adapt it.

## Prerequisites

- Stable Rust with the `wasm32v1-none` target. The checked-in
  [`rust-toolchain.toml`](https://github.com/tributary-protocol/tributary/blob/main/rust-toolchain.toml)
  selects the right toolchain automatically once you run any `cargo` command.
- The [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`),
  installed and on your `PATH`.
- A funded testnet identity. The deploy script uses the identity named
  `deployer` by default; create and fund one with:

  ```bash
  stellar keys generate deployer --network testnet --fund
  ```

  Any identity name works — pass it as the first argument to `deploy.sh`.

## 1. Build the wasm

From the repo root:

```bash
cargo build --release --target wasm32v1-none -p tributary-splitter
```

This produces `target/wasm32v1-none/release/tributary_splitter.wasm`. The
contract is `no_std` and uses typed errors, so the build has no host OS
dependencies.

## 2. Deploy to testnet

The simplest path is the script:

```bash
./scripts/deploy.sh deployer
```

It builds the wasm, then deploys it under the `splitter` alias:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/tributary_splitter.wasm \
  --source deployer \
  --network testnet \
  --alias splitter
```

`--alias splitter` stores the resulting contract id locally, so later commands
can reference it by name instead of by the long id. After this succeeds, the
deployed contract id is in your local Stellar CLI config under that alias.

## 3. Smoke-test it

`scripts/demo.sh` runs a full create-and-pay cycle against whatever contract
the `splitter` alias points at, so it exercises your fresh deployment:

```bash
./scripts/demo.sh deployer
```

It creates a 60/40 split between two fresh accounts, pays 1 XLM through it, then
pays 0.5 XLM via `pay_many`, and prints the resulting balances. A clean run
means your contract is live and accepting calls.

## 4. Regenerate the SDK bindings

The published SDK is pinned to the project's testnet deployment. To point your
local SDK at your own contract, regenerate the TypeScript bindings from your
instance:

```bash
stellar contract bindings typescript \
  --contract-id "$(stellar contract id splitter --network testnet)" \
  --network testnet \
  --output-dir sdk --overwrite
```

Then rebuild the SDK so the new contract id and spec take effect:

```bash
cd sdk
npm install
npm run build
```

If you maintain a fork, restore `sdk/README.md` and the package name in
`sdk/package.json` afterward, or keep your deployment as the default — that is
your call.

## 5. (Optional) Point the dashboard at it

The web app reads the contract id from the SDK's `networks` map. After
regenerating bindings, build the app and run it locally to drive your
deployment from the UI:

```bash
cd app
npm install
npm run build
```

## Troubleshooting

- **`target wasm32v1-none not found`** — the toolchain file should add it on
  first build. If it did not, run `rustup target add wasm32v1-none`.
- **`insufficient balance` on deploy** — fund the deploying identity with
  `stellar keys fund deployer --network testnet`.
- **`contract id splitter not found`** — the alias is created only on a
  successful deploy. Re-run `scripts/deploy.sh` or pass `--id <contract-id>`
  explicitly to later `stellar contract` commands.

## Where to go next

- [SDK quickstart](quickstart.md) to make your first read and write calls.
- [Architecture](architecture.md) for storage layout, money paths, and error codes.
- [Glossary](glossary.md) for split, share, controller, escrow, and dust.
