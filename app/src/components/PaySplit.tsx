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
  const [amountError, setAmountError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const selected = splits.find((s) => String(s.id) === splitId);

  useEffect(() => {
    let active = true;
    setAmountError(null);
    if (splitId === "" || !amount || parseFloat(amount) <= 0) {
      setPreview([]);
      return;
    }
    try {
      const stroops = toStroops(amount);
      previewPayout(BigInt(splitId), stroops).then((parts) => {
        if (active) setPreview(parts);
      });
    } catch (e) {
      if (active) {
        setPreview([]);
        setAmountError(e instanceof Error ? e.message : String(e));
      }
    }
    return () => {
      active = false;
    };
  }, [splitId, amount]);

  function handlePayClick() {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "" || !amount) {
      setMessage(t("pickSplitAndAmount"));
      return;
    }
    setShowConfirm(true);
  }

  async function submit() {
    setShowConfirm(false);
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
      {amountError && <p className="note">{amountError}</p>}
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
      <button disabled={busy || !!amountError || splitId === "" || !amount} onClick={handlePayClick}>
        {busy ? t("waitingForSignature") : t("payButton")}
      </button>
      {message && <p className="note">{message}</p>}

      {showConfirm && selected && preview.length === selected.recipients.length && (
        <div className="modal-overlay" data-testid="confirm-dialog">
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">{t("confirmPaymentTitle")}</h3>
            <p className="message">{t("confirmPaymentPrompt")}</p>
            
            <div
              style={{
                fontSize: "13px",
                fontWeight: "650",
                borderBottom: "1px solid var(--line)",
                paddingBottom: "8px",
                justifyContent: "space-between",
                display: "flex",
                marginTop: "4px",
              }}
            >
              <span>{t("recipient")}</span>
              <span>{t("payoutAmount")}</span>
            </div>
            
            <ul className="preview" style={{ maxHeight: "200px", overflowY: "auto", margin: 0, padding: 0 }}>
              {selected.recipients.map((r, i) => (
                <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13px" }}>
                  <span style={{ fontFamily: "monospace" }}>{recipientLabel(r)}</span>
                  <span>
                    {fromStroops(preview[i])} {token.code}
                  </span>
                </li>
              ))}
            </ul>
            
            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setShowConfirm(false)}
                style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--line)" }}
              >
                {t("cancel")}
              </button>
              <button type="button" onClick={submit}>
                {t("confirmAndPay")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
