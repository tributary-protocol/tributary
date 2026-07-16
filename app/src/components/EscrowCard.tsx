import { useEffect, useMemo, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  TOKENS,
  SplitView,
} from "../lib/tributary";
import TokenPicker from "./TokenPicker";
import FeeHint from "./FeeHint";

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
  const [pending, setPending] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPending(id: string) {
    if (id === "") {
      setPending(null);
      return;
    }
    try {
      const { result } = await readClient().balance({
        id: BigInt(id),
        token: token.contract,
      });
      setPending(result);
    } catch {
      setPending(null);
    }
  }

  useEffect(() => {
    loadPending(splitId);
  }, [splitId, token]);

  const depositFee = useMemo(() => {
    if (!wallet || splitId === "" || !amount || parseFloat(amount) <= 0) {
      return null;
    }
    return () =>
      walletClient(wallet).deposit({
        from: wallet,
        id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount),
      });
  }, [wallet, splitId, amount, token]);

  const distributeFee = useMemo(() => {
    if (!wallet || splitId === "" || !pending) return null;
    return () =>
      walletClient(wallet).distribute({
        id: BigInt(splitId),
        token: token.contract,
      });
  }, [wallet, splitId, token, pending]);

  async function distribute() {
    if (!wallet) {
      setMessage("Connect your wallet first.");
      return;
    }
    if (splitId === "") {
      setMessage("Pick a split.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.distribute({
        id: BigInt(splitId),
        token: token.contract,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? `Distributed ${fromStroops(result.unwrap())} ${token.code} to all recipients.`
          : "Nothing to distribute.",
      );
      await loadPending(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
      await loadPending(splitId);
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
      {pending !== null && (
        <p className="hint">
          Pending: {fromStroops(pending)} {token.code}
        </p>
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
      <FeeHint assemble={depositFee} label="Estimated deposit fee" />
      <FeeHint assemble={distributeFee} label="Estimated distribute fee" />
      <div className="row">
        <button disabled={busy} onClick={deposit}>
          {busy ? "Working…" : "Deposit"}
        </button>
        <button
          className="ghost"
          disabled={busy || !pending}
          onClick={distribute}
        >
          Distribute
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
