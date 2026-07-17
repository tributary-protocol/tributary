import { useEffect, useState } from "react";
import {
  walletClient,
  toStroops,
  fromStroops,
  previewPayout,
  recipientLabel,
  TOKENS,
  SplitView,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";

export default function PaySplit({
  wallet,
  splits,
  onPaid,
}: {
  wallet: string | null;
  splits: SplitView[];
  onPaid: () => void;
}) {
  const { t } = useTranslation();
  const [splitId, setSplitId] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(TOKENS[0]);
  const [preview, setPreview] = useState<bigint[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = splits.find((s) => String(s.id) === splitId);

  useEffect(() => {
    let active = true;
    if (splitId === "" || !amount || parseFloat(amount) <= 0) {
      setPreview([]);
      return;
    }
    previewPayout(BigInt(splitId), toStroops(amount)).then((parts) => {
      if (active) setPreview(parts);
    });
    return () => {
      active = false;
    };
  }, [splitId, amount]);

  async function submit() {
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
      const tx = await client.pay({
        from: wallet,
        id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount),
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? t("paySuccess", { amount, token: token.code, id: splitId })
          : t("payFailed"),
      );
      onPaid();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("payTitle")}</h2>
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
      {selected && preview.length === selected.recipients.length && (
        <ul className="preview">
          {selected.recipients.map((r, i) => (
            <li key={i}>
              <span>{recipientLabel(r)}</span>
              <span>
                {fromStroops(preview[i])} {token.code}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button disabled={busy} onClick={submit}>
        {busy ? t("waitingForSignature") : t("payButton")}
      </button>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
