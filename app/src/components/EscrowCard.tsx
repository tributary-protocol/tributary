import { useEffect, useMemo, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  TOKENS,
  SplitView,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";
import FeeHint from "./FeeHint";

export default function EscrowCard({
  wallet,
  splits,
  selectedSplitId,
}: {
  wallet: string | null;
  splits: SplitView[];
  selectedSplitId?: string;
}) {
  const { t } = useTranslation();
  const [splitId, setSplitId] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(TOKENS[0]);
  const [pending, setPending] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSplitId !== undefined) {
      setSplitId(selectedSplitId);
    }
  }, [selectedSplitId]);

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
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "") {
      setMessage(t("pickSplit"));
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
          ? t("distributeSuccess", { amount: fromStroops(result.unwrap()), token: token.code })
          : t("distributeFailed"),
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
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "" || !amount) {
      setMessage(t("pickSplitAndAmount"));
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
        result.isOk()
          ? t("depositSuccess", { amount, token: token.code })
          : t("depositFailed"),
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
      <h2>{t("escrowTitle")}</h2>
      <p className="hint">
        {t("escrowDesc")}
      </p>
      <div className="row">
        <select value={splitId} onChange={(e) => setSplitId(e.target.value)}>
          <option value="">{t("chooseSplit")}</option>
          {splits.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {t("recipientsCount", { count: s.recipients.length })}
            </option>
          ))}
        </select>
      </div>
      {pending !== null && (
        <p className="hint">
          {t("pending", { amount: fromStroops(pending), token: token.code })}
        </p>
      )}
      <div className="row">
        <input
          type="number"
          min="0"
          step="0.0000001"
          placeholder={t("amount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TokenPicker token={token} onChange={setToken} />
      </div>
      <FeeHint assemble={depositFee} labelKey="estimatedDepositFee" />
      <FeeHint assemble={distributeFee} labelKey="estimatedDistributeFee" />
      <div className="row">
        <button disabled={busy} onClick={deposit}>
          {busy && <span className="btn-spinner" />}
          {busy ? t("working") : t("depositButton")}
        </button>
        <button
          className="ghost"
          disabled={busy || !pending}
          onClick={distribute}
        >
          {busy && <span className="btn-spinner" />}
          {busy ? t("working") : t("distributeButton")}
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
