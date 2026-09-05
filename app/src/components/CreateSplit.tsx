import { useMemo, useState } from "react";
import { walletClient } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import RecipientEditor, {
  Row,
  rowsError,
  toRecipient,
  toShares,
} from "./RecipientEditor";
import FeeHint from "./FeeHint";

export default function CreateSplit({
  wallet,
  onCreated,
}: {
  wallet: string | null;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([
    { kind: "address", value: "", percent: "60" },
    { kind: "address", value: "", percent: "40" },
  ]);
  const [controllerType, setControllerType] = useState<"none" | "single" | "threshold">("single");
  const [threshold, setThreshold] = useState(2);
  const [signers, setSigners] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function applyTemplate(percents: number[]) {
    setRows(
      percents.map((p, i) => ({
        kind: rows[i]?.kind ?? "address",
        value: rows[i]?.value ?? "",
        percent: String(p),
      })),
    );
  }

  const controller = useMemo(() => {
    if (controllerType === "none") return undefined;
    if (controllerType === "single") return wallet ?? undefined;
    const signerList = signers.split(",").map((s) => s.trim()).filter(Boolean);
    if (signerList.length === 0) return undefined;
    return { threshold, signers: signerList };
  }, [controllerType, wallet, threshold, signers]);

  const assembleFee = useMemo(() => {
    if (!wallet || rowsError(rows, t)) return null;
    return () =>
      walletClient(wallet).create_split({
        creator: wallet,
        recipients: rows.map(toRecipient),
        shares: toShares(rows),
        controller,
      });
  }, [wallet, rows, controller]);

  const templates: [string, number[]][] = [
    ["50/50", [50, 50]],
    ["60/40", [60, 40]],
    ["Thirds", [33.34, 33.33, 33.33]],
    ["90/10", [90, 10]],
  ];

  async function submit() {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    const invalid = rowsError(rows, t);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.create_split({
        creator: wallet,
        recipients: rows.map(toRecipient),
        shares: toShares(rows),
        controller,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? t("splitCreated", { id: result.unwrap().toString() })
          : t("contractRejectedSplit"),
      );
      onCreated();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("createTitle")}</h2>
      <div className="row templates">
        {templates.map(([label, percents]) => (
          <button
            key={label}
            className="ghost small"
            onClick={() => applyTemplate(percents)}
          >
            {label}
          </button>
        ))}
      </div>
      <RecipientEditor rows={rows} onChange={setRows} />
      <div className="controller-config">
        <label className="field">
          <span>{t("controllerLabel")}</span>
          <select
            value={controllerType}
            onChange={(e) =>
              setControllerType(e.target.value as "none" | "single" | "threshold")
            }
          >
            <option value="none">{t("controllerNone")}</option>
            <option value="single">{t("controllerSingle")}</option>
            <option value="threshold">{t("controllerThreshold")}</option>
          </select>
        </label>
        {controllerType === "threshold" && (
          <>
            <label className="field">
              <span>{t("thresholdLabel")}</span>
              <input
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 1)}
              />
            </label>
            <label className="field">
              <span>{t("signersLabel")}</span>
              <textarea
                placeholder={t("signersPlaceholder")}
                value={signers}
                onChange={(e) => setSigners(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <p className="hint" title="When a payment cannot be divided evenly, the tiny remainder (dust) goes to the last recipient so the full amount always lands somewhere.">
        ⓘ Rounding dust goes to the last recipient.
      </p>
      <FeeHint assemble={assembleFee} />
      <button disabled={busy} onClick={submit}>
        {busy && <span className="btn-spinner" />}
        {busy ? t("waitingForSignature") : t("createButton")}
      </button>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
