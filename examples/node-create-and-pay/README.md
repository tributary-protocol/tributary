# node-create-and-pay

A standalone Node script that runs the full create-then-pay flow through
`tributary-sdk` against testnet: fund a payer and two recipients, create a
60/40 split, pay 1 XLM through it, then print both recipient balances.

Unlike the [dashboard](../../app) it does not need a browser wallet. Signing
happens locally with `@stellar/stellar-sdk`'s `basicNodeSigner`, re-exported
by `tributary-sdk`. It is the Node equivalent of
[`scripts/demo.sh`](../../scripts/demo.sh), which does the same thing with
the Stellar CLI.

## Setup

Build the sdk once (the example depends on it via a local `file:` reference):

```
cd sdk
npm install
npm run build
```

Then install and run the example:

```
cd examples/node-create-and-pay
npm install
npm start
```

## What it does

1. Loads a payer account from `PAYER_SECRET`, or generates and funds a fresh
   one via Friendbot and prints its secret so you can reuse it on the next
   run.
2. Generates and funds two fresh recipient accounts.
3. Calls `create_split` to register a 60/40 split between them.
4. Calls `pay` to move `AMOUNT_XLM` (default `1`) XLM through the split in
   one transaction.
5. Prints the resulting XLM balance of each recipient.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PAYER_SECRET` | none | Secret key (`S...`) of an already-funded testnet account to pay from. If unset, a new account is generated and funded. |
| `AMOUNT_XLM` | `1` | Amount of XLM to pay through the split, as a plain decimal string. |

## Tests

`src/amounts.ts` converts between XLM and stroops; `src/amounts.test.ts`
covers that conversion without touching the network:

```
npm test
```
