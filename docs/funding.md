# Funding a Testnet Account (Friendbot)

To interact with the Tributary contract and web application on the Stellar Testnet, you need a funded Testnet account. Unlike Mainnet, where transactions require real XLM, the Stellar Testnet provides a free service called **Friendbot** to fund accounts with 10,000 test XLM.

This guide covers how to fund a Testnet account for first use, depending on how you are interacting with Tributary.

---

## 1. Web App Testing (Freighter Wallet)

If you are using the web dashboard to create or pay splits:

1. **Install Freighter**: If you haven't already, install the [Freighter browser extension](https://freighter.app).
2. **Switch to Testnet**:
   - Open Freighter, click the gear icon (Settings) in the top-right corner.
   - Go to **Preferences** -> **Network**.
   - Select **Testnet**.
3. **Copy your Address**: Copy your public address from the main screen of Freighter.
4. **Fund via Stellar Laboratory**:
   - Visit the [Stellar Laboratory Friendbot tool](https://laboratory.stellar.org/#account-creator?network=testnet).
   - Enter your public address into the **Friendbot: Fund an existing account** field.
   - Click **Get Test Network Lumens**.
   - Alternatively, you can use the direct link: [https://lab.stellar.org/account/fund](https://lab.stellar.org/account/fund) and follow the prompts.

Once funded, you can connect your Freighter wallet to [tributary-omega.vercel.app](https://tributary-omega.vercel.app) and start interacting.

---

## 2. Local Development & Scripts (Stellar CLI)

The development scripts in this repository ([scripts/deploy.sh](file:///c:/Users/hp/drips/kosiso/tributary/scripts/deploy.sh) and [scripts/demo.sh](file:///c:/Users/hp/drips/kosiso/tributary/scripts/demo.sh)) execute transactions using a local identity (defaults to `deployer`). You must create and fund this identity before running the scripts.

### Generating and Funding an Identity

You can generate a new keypair and fund it automatically in a single command using the Stellar CLI:

```bash
stellar keys generate deployer --network testnet --fund
```

This command does two things:
1. Generates a new keypair named `deployer` and stores it in your local secure configuration.
2. Contacts the Friendbot API to fund the generated public address with 10,000 test XLM.

To verify the key was created and funded, check its balance:
```bash
stellar keys balance deployer --network testnet
```

---

## 3. Direct API Request (cURL/HTTP)

If you are writing a custom script or need to fund an existing public key programmatically, you can hit the Friendbot HTTP endpoint directly:

```bash
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
```

Replace `YOUR_PUBLIC_KEY` with the Stellar G... address you wish to fund. Friendbot will return a JSON response containing the transaction details once the account has been created and funded.
