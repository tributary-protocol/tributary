import { useEffect, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  tokenCode,
  fetchHeldTokens,
  TOKENS,
  SplitView,
} from "../lib/tributary";
import TokenPicker from "./TokenPicker";

interface TokenBalance {
  contract: string;
  code: string;
  balance: bigint;
}

export default function EscrowCard({
  wallet,
  splits,
}: {
  wallet: string | null;
  splits: SplitView[];
}) {
  const [splitId, setSplitId] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(TOKENS[0]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [distributing, setDistributing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadBalances(id: string) {
    if (id === "") {
      setBalances([]);
      setLoadError(null);
      return;
    }
    setLoadError(null);
    try {
      const tokens = await fetchHeldTokens(BigInt(id));
      if (tokens.length === 0) {
        setBalances([]);
        return;
      }
      const items = await Promise.all(
        tokens.map(async (contract) => {
          const { result } = await readClient().balance({
            id: BigInt(id),
            token: contract,
          });
          return {
            contract,
            code: tokenCode(contract),
            balance: result,
          };
        }),
      );
      // Filter out any zero balances that may have been cleared since fetchHeldTokens ran
      setBalances(items.filter((t) => t.balance > 0n));
    } catch {
      setLoadError("Failed to load pending balances.");
      setBalances([]);
    }
  }

  useEffect(() => {
    loadBalances(splitId);
  }, [splitId]);

  async function distribute(contract: string, code: string) {
    if (!wallet) {
      setMessage("Connect your wallet first.");
      return;
    }
    setDistributing(contract);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.distribute({
        id: BigInt(splitId),
        token: contract,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? `Distributed ${fromStroops(result.unwrap())} ${code} to all recipients.`
          : "Nothing to distribute.",
      );
      await loadBalances(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDistributing(null);
    }
  }

  async function deposit() {
    if (!wallet) {
      setMessage("Connect your wallet first.");
      return;
    }
    if (splitId === "" || !amount) {
      setMessage("Pick a split and an amount.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.deposit({
        from: wallet,
        id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount),
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk() ? `Deposited ${amount} ${token.code}.` : "Deposit failed.",
      );
      await loadBalances(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Escrow</h2>
      <p className="hint">
        Park funds in a split now, pay everyone out later.
      </p>
      <div className="row">
        <select value={splitId} onChange={(e) => setSplitId(e.target.value)}>
          <option value="">Choose split</option>
          {splits.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {s.recipients.length} recipients
            </option>
          ))}
        </select>
      </div>

      {splitId !== "" && (
        <div className="escrow-balances">
          {loadError && <p className="note">{loadError}</p>}
          {!loadError && balances.length === 0 && (
            <p className="hint">No pending balances.</p>
          )}
          {balances.map((t) => (
            <div className="row" key={t.contract}>
              <span className="hint">
                Pending: {fromStroops(t.balance)} {t.code}
              </span>
              <button
                className="ghost"
                disabled={distributing === t.contract}
                onClick={() => distribute(t.contract, t.code)}
              >
                {distributing === t.contract ? "Working…" : "Distribute"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <input
          type="number"
          min="0"
          step="0.0000001"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TokenPicker token={token} onChange={setToken} />
      </div>
      <div className="row">
        <button disabled={busy} onClick={deposit}>
          {busy ? "Working…" : "Deposit"}
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
