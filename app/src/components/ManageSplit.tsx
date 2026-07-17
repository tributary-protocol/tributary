import { useState } from "react";
import { walletClient, SplitView, Recipient } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import RecipientEditor, {
  Row,
  rowsError,
  toRecipient,
  toShares,
} from "./RecipientEditor";

function toRows(split: SplitView): Row[] {
  return split.recipients.map((r: Recipient, i: number) => ({
    kind: r.tag === "Account" ? ("address" as const) : ("split" as const),
    value: String(r.values[0]),
    percent: String(split.shares[i] / 100),
  }));
}

export default function ManageSplit({
  wallet,
  splits,
  onChanged,
}: {
  wallet: string | null;
  splits: SplitView[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [splitId, setSplitId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [confirmLock, setConfirmLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mine = splits.filter((s) => s.controller === wallet);
  if (!wallet || mine.length === 0) return null;

  function select(id: string) {
    setSplitId(id);
    setConfirmLock(false);
    setMessage(null);
    const split = mine.find((s) => String(s.id) === id);
    setRows(split ? toRows(split) : []);
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    const invalid = rowsError(rows, t);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    await run(async () => {
      const tx = await walletClient(wallet!).update_split({
        id: BigInt(splitId),
        recipients: rows.map(toRecipient),
        shares: toShares(rows),
      });
      const { result } = await tx.signAndSend();
      return result.isOk() ? t("updateSuccess") : t("updateFailed");
    });
  }

  async function transfer() {
    if (!/^G[A-Z2-7]{55}$/.test(transferTo.trim())) {
      setMessage(t("controllerFormatError"));
      return;
    }
    await run(async () => {
      const tx = await walletClient(wallet!).transfer_control({
        id: BigInt(splitId),
        new_controller: transferTo.trim(),
      });
      const { result } = await tx.signAndSend();
      return result.isOk() ? t("transferSuccess") : t("transferFailed");
    });
  }

  async function lock() {
    if (!confirmLock) {
      setConfirmLock(true);
      setMessage(t("lockConfirmPrompt"));
      return;
    }
    await run(async () => {
      const tx = await walletClient(wallet!).transfer_control({
        id: BigInt(splitId),
        new_controller: undefined,
      });
      const { result } = await tx.signAndSend();
      return result.isOk() ? t("lockSuccess") : t("lockFailed");
    });
  }

  return (
    <section className="card">
      <h2>{t("manageTitle")}</h2>
      <div className="row">
        <select value={splitId} onChange={(e) => select(e.target.value)}>
          <option value="">{t("chooseSplitControl")}</option>
          {mine.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {t("recipientsCount", { count: s.recipients.length })}
            </option>
          ))}
        </select>
      </div>
      {splitId !== "" && (
        <>
          <RecipientEditor rows={rows} onChange={setRows} />
          <div className="row">
            <button disabled={busy} onClick={update}>
              {t("updateButton")}
            </button>
          </div>
          <div className="row">
            <input
              placeholder={t("placeholderController")}
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
            />
            <button className="ghost" disabled={busy} onClick={transfer}>
              {t("transferButton")}
            </button>
            <button className="ghost" disabled={busy} onClick={lock}>
              {confirmLock ? t("confirmLockButton") : t("lockButton")}
            </button>
          </div>
        </>
      )}
      {message && <p className="note">{message}</p>}
    </section>
  );
}
