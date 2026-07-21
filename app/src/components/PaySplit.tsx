import { useEffect, useRef, useState } from "react";
import {
  walletClient,
  toStroops,
  fromStroops,
  previewPayout,
  recipientLabel,
  checkTrustlines,
  shortAddress,
  TOKENS,
  SplitView,
  TrustlineCheckResult,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";
import Tooltip from "./Tooltip";

export default function PaySplit({
  wallet,
  splits,
  selectedSplitId,
  onPaid,
}: {
  wallet: string | null;
  splits: SplitView[];
  selectedSplitId?: string;
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
  const [trustlineResult, setTrustlineResult] =
    useState<TrustlineCheckResult | null>(null);
  const [trustlineChecking, setTrustlineChecking] = useState(false);
  // Debounce timer ref so rapid token/split changes don't fire multiple RPC calls
  const trustlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = splits.find((s) => String(s.id) === splitId);
  useEffect(() => {
    if (selectedSplitId !== undefined) {
      setSplitId(selectedSplitId);
    }
  }, [selectedSplitId]);

  // Preview payout amounts whenever split or amount changes
  useEffect(() => {
    let active = true;
    setAmountError(null);
    if (splitId === "" || !amount || parseFloat(amount) <= 0) {
      setPreview([]);
      return;
    }
    try {
      const stroops = toStroops(amount, token.decimals);
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
  }, [splitId, amount, token.decimals]);

  // Trustline check — debounced 400 ms, fired when split or token changes
  useEffect(() => {
    setTrustlineResult(null);
    if (!selected) return;

    if (trustlineTimer.current) clearTimeout(trustlineTimer.current);
    trustlineTimer.current = setTimeout(() => {
      setTrustlineChecking(true);
      checkTrustlines(selected, token)
        .then((result) => {
          setTrustlineResult(result);
        })
        .catch(() => {
          // Network failure — treat as inconclusive, do not block payment
          setTrustlineResult({ warnings: [], hasErrors: true });
        })
        .finally(() => {
          setTrustlineChecking(false);
        });
    }, 400);

    return () => {
      if (trustlineTimer.current) clearTimeout(trustlineTimer.current);
    };
  }, [splitId, token]);

  // Derive blocking warnings (confirmed no-trustline) vs inconclusive notices
  const blockingWarnings =
    trustlineResult?.warnings.filter((w) => w.status === "no_trustline") ?? [];
  const inconclusiveWarnings =
    trustlineResult?.warnings.filter((w) => w.status === "inconclusive") ?? [];
  // Only block the payment when there are confirmed missing trustlines
  const hasBlockingWarnings = blockingWarnings.length > 0;

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
        amount: toStroops(amount, token.decimals),
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
        <label htmlFor="split-select" className="visually-hidden">{t("chooseSplit")}</label>
        <select id="split-select" value={splitId} onChange={(e) => setSplitId(e.target.value)}>
          <option value="">{t("chooseSplit")}</option>
          {splits.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {t("recipientsCount", { count: s.recipients.length })}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="amount-input" className="visually-hidden">{t("amount")}</label>
        <input
          id="amount-input"
          type="number"
          min="0"
          step={1 / 10 ** token.decimals}
          placeholder={t("amount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TokenPicker token={token} onChange={setToken} />
      </div>
      {amountError && <p className="note">{amountError}</p>}
      {selected && preview.length === selected.recipients.length && (
        <div className="preview">
          <div className="preview-heading">
            <span>{t("payoutPreview")}</span>
            <Tooltip label="dust">{t("dustExplainer")}</Tooltip>
          </div>
          <ul>
            {selected.recipients.map((r, i) => (
              <li key={i}>
                <span>{recipientLabel(r)}</span>
                <span>
                  {fromStroops(preview[i], token.decimals)} {token.code}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trustline warnings — shown once a split and token are both chosen */}
      {selected && !trustlineChecking && blockingWarnings.length > 0 && (
        <div className="note trustline-warn" role="alert">
          <strong>{t("trustlineWarningTitle", { token: token.code })}</strong>
          <ul>
            {blockingWarnings.map((w) => (
              <li key={w.address}>
                {t("trustlineWarningItem", {
                  address: shortAddress(w.address),
                  token: token.code,
                })}
              </li>
            ))}
          </ul>
          <span>{t("trustlineWarningHint")}</span>
        </div>
      )}
      {selected && !trustlineChecking && inconclusiveWarnings.length > 0 && (
        <div className="note trustline-notice" role="status">
          <strong>{t("trustlineNoticeTitle")}</strong>
          <ul>
            {inconclusiveWarnings.map((w) => (
              <li key={w.address}>{shortAddress(w.address)}</li>
            ))}
          </ul>
          <span>{t("trustlineNoticeHint")}</span>
        </div>
      )}

      <button
        disabled={busy || !!amountError || hasBlockingWarnings}
        onClick={submit}
      >
        {busy && <span className="btn-spinner" />}
        {busy ? t("waitingForSignature") : t("payButton")}
      </button>
      {message && <p className="note">{message}</p>}
    </section>
  );
}