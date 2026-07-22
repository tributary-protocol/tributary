import { requestAccess, signTransaction, isConnected } from "@stellar/freighter-api";
import { Client, networks } from "tributary-sdk";

// A basic widget to demonstrate embedding tributary-sdk.
// It looks for a div with id "tributary-donation-widget" and mounts a donate button.
function mountWidget() {
  const container = document.getElementById("tributary-donation-widget");
  if (!container) return;

  const splitIdStr = container.dataset.splitId || "1";
  const networkName = container.dataset.network || "testnet";
  const splitId = BigInt(splitIdStr);

  const isTestnet = networkName === "testnet";
  const networkConfig = isTestnet 
    ? networks.testnet 
    : {
        networkPassphrase: "Public Global Stellar Network ; September 2015",
        contractId: "C_REPLACE_WITH_MAINNET_CONTRACT_ID"
      };

  const rpcUrl = isTestnet 
    ? "https://soroban-testnet.stellar.org" 
    : "https://soroban-mainnet.stellar.org";
    
  // Using Stellar Asset Contract ID for XLM on Testnet as default
  const XLM_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  // Render a basic form
  container.innerHTML = `
    <div style="font-family: sans-serif; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; background: #fff; max-width: 300px; margin: 0 auto; text-align: center;">
      <h3 style="margin-top: 0;">Donate to Split #${splitIdStr}</h3>
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.9rem; margin-bottom: 0.5rem;">Amount (XLM)</label>
        <input type="number" id="tributary-amount" value="10" min="1" step="1" style="width: 100%; padding: 0.5rem; box-sizing: border-box;" />
      </div>
      <button id="tributary-donate-btn" style="background: #000; color: #fff; padding: 0.75rem 1rem; border: none; border-radius: 4px; width: 100%; cursor: pointer; font-weight: bold;">
        Donate with Freighter
      </button>
      <p id="tributary-status" style="margin-top: 1rem; font-size: 0.85rem; color: #666;"></p>
    </div>
  `;

  const btn = document.getElementById("tributary-donate-btn");
  const amountInput = document.getElementById("tributary-amount") as HTMLInputElement;
  const statusEl = document.getElementById("tributary-status");

  btn?.addEventListener("click", async () => {
    if (!statusEl) return;
    try {
      btn.setAttribute("disabled", "true");
      statusEl.textContent = "Connecting to Freighter...";
      statusEl.style.color = "#666";

      const connected = await isConnected();
      if (!connected.isConnected) {
        throw new Error("Freighter is not installed or locked.");
      }
      
      const access = await requestAccess();
      if (access.error) {
        throw new Error(access.error);
      }
      
      const publicKey = access.address;

      statusEl.textContent = "Building transaction...";

      const client = new Client({
        ...networkConfig,
        rpcUrl,
        publicKey,
        signTransaction,
      });

      // Convert input amount to stroops (7 decimals)
      const amountVal = parseFloat(amountInput.value);
      if (isNaN(amountVal) || amountVal <= 0) {
        throw new Error("Invalid amount");
      }
      const amountStroops = BigInt(Math.floor(amountVal * 10_000_000));

      const tx = await client.pay({
        from: publicKey,
        id: splitId,
        token: XLM_CONTRACT,
        amount: amountStroops
      });

      statusEl.textContent = "Please sign in Freighter...";

      const txResult = await tx.signAndSend();
      statusEl.textContent = `Success!`;
      statusEl.style.color = "green";
      console.log("Transaction successful!", txResult);

    } catch (err: any) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = "red";
      console.error(err);
    } finally {
      btn.removeAttribute("disabled");
    }
  });
}

mountWidget();
