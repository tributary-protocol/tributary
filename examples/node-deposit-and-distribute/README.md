# node-deposit-and-distribute

A standalone Node script that demonstrates subscription payouts via iterative deposits and a scheduled distribute using `tributary-sdk` against testnet: fund a payer and two recipients, create a 60/40 split, perform 3 recurring deposits of 1 XLM into it, and then call distribute to pay out the accumulated funds.

Unlike the [dashboard](../../app) it does not need a browser wallet. Signing
happens locally with `@stellar/stellar-sdk`'s `basicNodeSigner`, re-exported
by `tributary-sdk`.

## Setup

Build the sdk once (the example depends on it via a local `file:` reference):

```
cd sdk
npm install
npm run build
```

Then install and run the example:

```
cd examples/node-deposit-and-distribute
npm install
npm start
```

## What it does

1. Loads a payer account from `PAYER_SECRET`, or generates and funds a fresh
   one via Friendbot and prints its secret so you can reuse it on the next
   run.
2. Generates and funds two fresh recipient accounts.
3. Calls `create_split` to register a 60/40 split between them.
4. Calls `deposit` iteratively 3 times with `AMOUNT_XLM` (default `1`) XLM to simulate subscription payments over time without paying out immediately.
5. Queries the contract for the split's accumulated `balance`.
6. Calls `distribute` to release all the deposited funds to the recipients.
7. Prints the resulting XLM balance of each recipient.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PAYER_SECRET` | none | Secret key (`S...`) of an already-funded testnet account to pay from. If unset, a new account is generated and funded. |
| `AMOUNT_XLM` | `1` | Amount of XLM to deposit iteratively, as a plain decimal string. |

## Tests

`src/amounts.ts` converts between XLM and stroops; `src/amounts.test.ts`
covers that conversion without touching the network:

```
npm test
```

