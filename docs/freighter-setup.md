# Freighter Setup Guide

Tributary's web dashboard reads from the Stellar network without a wallet, but **creating splits, paying through them, and any write operation** requires a Freighter wallet connected to Testnet.

This guide walks through installing Freighter, funding a testnet account, and confirming your setup works end-to-end.

---

## 1. Install Freighter

Freighter is a browser extension wallet for the Stellar network.

| Browser | Install link |
| --- | --- |
| Chrome / Brave / Edge | [Chrome Web Store](https://chrome.google.com/webstore/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/freighter/) |

After installing:

1. Click **Create a new wallet** (or **Import wallet** if you already have a seed phrase).
2. Record your 12-word secret phrase somewhere safe — Freighter cannot recover it for you.
3. Set a password for this browser session.

---

## 2. Switch to Testnet

> **Important:** Tributary is deployed only on Testnet. Connecting to Mainnet will result in failed or stuck transactions.

1. Open Freighter by clicking its extension icon.
2. Click the **network name** in the top-right corner (it defaults to "Mainnet").
3. Select **Test SDF Network (Testnet)** from the dropdown.

The header should now read **TESTNET** in orange. If you don't see it, reopen the extension dropdown.

---

## 3. Fund your account (Friendbot)

Testnet accounts must be activated with a small XLM balance before they can sign transactions.

1. Copy your testnet public key from Freighter (the `G…` address shown at the top).
2. Open [Stellar Friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet) in a new tab.
3. Paste your public key and click **Get lumens**.

Within a few seconds your Freighter balance will update to **10,000 XLM**. You're ready.

---

## 4. Connect to the Tributary dashboard

1. Open [tributary-omega.vercel.app](https://tributary-omega.vercel.app).
2. Click **Connect wallet** in the top-right corner.
3. Freighter will prompt you to approve the connection — click **Allow**.

You should see your shortened address in the header. Any write operation (create split, pay, distribute) will now open a Freighter confirmation pop-up showing the exact transaction before it is signed and submitted.

---

## 5. Verify everything works

Run the demo script against the live testnet contract as a quick sanity check. You'll need the [Stellar CLI](https://developers.stellar.org/docs/tools/cli) installed and a funded testnet identity:

```bash
./scripts/demo.sh
```

This executes a full create-and-pay cycle and prints each step. A clean run confirms your local CLI identity and the deployed contract are both working.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Account not found" when connecting | Fund your account via Friendbot (step 3). |
| Transaction fails immediately | Confirm Freighter is on **Testnet**, not Mainnet. |
| Freighter pop-up never appears | Check your browser blocked pop-ups; allow them for the Tributary domain. |
| "Insufficient balance" | Request XLM from Friendbot again — the 10,000 XLM grant is plenty for testing. |
| Wrong address shown after connecting | Switch the account inside Freighter (gear icon → Manage wallets). |

---

## Further reading

- [Freighter documentation](https://docs.freighter.app)
- [Stellar Testnet Friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet)
- [Stellar CLI installation guide](https://developers.stellar.org/docs/tools/cli)
- [Tributary architecture](architecture.md) — how the contract and app fit together
