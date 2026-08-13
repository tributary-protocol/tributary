# Testnet Funding Guide (Friendbot)

Every Stellar account — including the ones Tributary pays — must exist on-chain
before it can send or receive anything. On testnet, **Friendbot** creates and
funds an account for free.

This guide covers funding from the browser, the Stellar CLI, and plain HTTP, plus
the Tributary-specific case that trips people up: **your recipients need funded
accounts too**.

> Setting up a browser wallet for the first time? Start with
> [freighter-setup.md](freighter-setup.md) — it walks through installing
> Freighter and funding it in the browser. This page is the reference for
> everything else, including CLI identities.

---

## What Friendbot actually does

A single Friendbot request does two things:

1. **Creates** the account on the testnet ledger (an address with no account is
   not "empty" — it does not exist).
2. **Funds** it with **10,000 XLM**.

Testnet XLM has no value and cannot be moved to mainnet. Testnet is also
**periodically reset**, which wipes every account and deployed contract — if a
previously funded account suddenly reports "account not found", a reset is the
usual reason. Just fund it again.

---

## Option 1 — Browser (Freighter users)

1. Copy your `G…` public key from Freighter.
2. Open [Stellar Friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet).
3. Paste the key and click **Get lumens**.

Full walkthrough with screenshots of each step:
[freighter-setup.md](freighter-setup.md#3-fund-your-account-friendbot).

---

## Option 2 — Stellar CLI (contract work, the demo script)

Anything that deploys or invokes the contract from a terminal — `docs/deploy.md`,
the standalone Node example — needs a funded **CLI identity**, which is separate
from your browser wallet.

Create and fund in one step:

```bash
stellar keys generate alice --network testnet --fund
```

Fund an identity that already exists:

```bash
stellar keys fund alice --network testnet
```

Check the address you just funded:

```bash
stellar keys address alice
```

---

## Option 3 — Plain HTTP

Friendbot is a public HTTP endpoint, which is the easiest route from a script or
CI job:

```bash
curl "https://friendbot.stellar.org/?addr=GABC...YOUR_PUBLIC_KEY"
```

It returns the funding transaction as JSON. A non-2xx response with
`op_already_exists` means the account is already created — which is a success for
your purposes, not an error.

---

## Funding the accounts a split pays

This is the Tributary-specific part, and the most common surprise.

A split's **recipients** are ordinary Stellar accounts. Paying through a split is
still a payment to each of them, so:

- **Every recipient account must already exist.** Paying a split whose recipient
  address has never been funded will fail. Fund each recipient with Friendbot
  exactly as above before paying.
- **For non-XLM tokens, each recipient needs a trustline** for that asset. The
  dashboard checks this before paying and blocks with *"Cannot pay in
  {token} — {address} has no {token} trustline"*. Friendbot does **not** create
  trustlines; the recipient's own wallet has to add the asset.
- **Nested splits are not accounts.** A recipient that is another split id needs
  no funding — only leaf `G…` addresses do.

A quick way to get several funded test recipients:

```bash
for name in alice bob carol; do
  stellar keys generate "$name" --network testnet --fund
  stellar keys address "$name"
done
```

---

## Verifying an account is funded

Via the CLI:

```bash
stellar keys address alice   # then look the address up
```

Or straight from Horizon:

```bash
curl -s "https://horizon-testnet.stellar.org/accounts/GABC...YOUR_PUBLIC_KEY" \
  | grep -o '"balance": "[^"]*"' | head -1
```

A `404` from that endpoint means the account does not exist yet — fund it.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `account not found` / `404` from Horizon | The account was never funded, or testnet was reset. Fund it again. |
| Friendbot returns `op_already_exists` | Already created and funded. Nothing to do. |
| Friendbot rate-limits or times out | It throttles per address and per IP. Wait a minute and retry; it is a shared public service. |
| Funded, but the wallet still shows nothing | Freighter is probably on Mainnet. Switch it to Testnet. |
| Payment fails although the payer is funded | A **recipient** is unfunded, or lacks a trustline for the token — see above. |
| Balance shrinks without a payment | Each transaction burns a small fee, and every account holds a minimum reserve. 10,000 XLM is far more than testing needs. |

---

## Further reading

- [freighter-setup.md](freighter-setup.md) — wallet install, testnet switch, first connection
- [quickstart.md](quickstart.md) — first split, end to end
- [deploy.md](deploy.md) — deploying your own contract instance with a funded identity
- [Stellar Friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet)
- [Stellar CLI installation guide](https://developers.stellar.org/docs/tools/cli)
