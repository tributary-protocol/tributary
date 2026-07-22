# node-royalties-split

A standalone Node script that demonstrates creating a locked split paying royalties across 3 collaborators using `tributary-sdk` against testnet: fund a payer and three collaborators, create a locked (no controller) 50/30/20 split, pay 10 XLM in royalties, and then print the balances.

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
cd examples/node-royalties-split
npm install
npm start
```

## What it does

1. Loads a payer account from `PAYER_SECRET`, or generates and funds a fresh
   one via Friendbot and prints its secret so you can reuse it on the next
   run.
2. Generates and funds three fresh collaborator accounts.
3. Calls `create_split` to register a locked 50/30/20 split (`controller: undefined`) between them.
4. Calls `pay` to move `AMOUNT_XLM` (default `10`) XLM through the split in
   one transaction to simulate a royalty payout.
5. Prints the resulting XLM balance of each collaborator.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PAYER_SECRET` | none | Secret key (`S...`) of an already-funded testnet account to pay from. If unset, a new account is generated and funded. |
| `AMOUNT_XLM` | `10` | Amount of XLM to pay as royalties, as a plain decimal string. |

## Tests

`src/amounts.ts` converts between XLM and stroops; `src/amounts.test.ts`
covers that conversion without touching the network:

```
npm test
```

