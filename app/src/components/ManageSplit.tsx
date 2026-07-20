import { useEffect, useMemo, useState } from "react";
import { walletClient, readClient, SplitView, Recipient } from "../lib/tributary";
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
  selectedSplitId,
  onChanged,
}: {
  wallet: string | null;
  splits: SplitView[];
  selectedSplitId?: string;
  onChanged: () => void;
}) {
  const [splitId, setSplitId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [confirmLock, setConfirmLock] = useState(false);
  const [pendingAddr, setPendingAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { t } = useTranslation();
  const mine = useMemo(
    () => splits.filter((s) => s.controller === wallet),
    [splits, wallet],
  );

  useEffect(() => {
    if (
      selectedSplitId !== undefined &&
      mine.some((s) => String(s.id) === selectedSplitId)
    ) {
      select(selectedSplitId);
    }
  }, [selectedSplitId, mine]);

  useEffect(() => {
    if (!splitId) {
      setPendingAddr(null);
      return;
    }
    let active = true;
    readClient()
      .pending_controller({ id: BigInt(splitId) })
      .then(({ result }) => {
        if (active) setPendingAddr(result ?? null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [splitId]);

  if (!wallet || mine.length === 0) return null;

  function select(id: string) {
    setSplitId(id);
    setConfirmLock(false);
    setTransferTo("");
    setMessage(null);
    const split = mine.find((s) => String(s.id) === id);
    setRows(split ? toRows(split) : []);
  }

  // Once control is gone the wallet can no longer act on this split, so
  // drop the selection instead of leaving a dead editor on screen.
  function clearSelection() {
    setSplitId("");
    setRows([]);
    setTransferTo("");
    setConfirmLock(false);
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

  async function proposeTransfer() {
    const to = transferTo.trim();
    if (!/^G[A-Z2-7]{55}$/.test(to)) {
      setMessage(t("controllerFormatError"));
      return;
    }
    if (to === wallet) {
      setMessage("That address already controls this split.");
      return;
    }
    const id = splitId;
    await run(async () => {
      const tx = await walletClient(wallet!).transfer_control({
        id: BigInt(id),
        new_controller: to,
      });
      const { result } = await tx.signAndSend();
      return result.isOk()
        ? `Transfer proposed to ${transferTo.trim().slice(0, 4)}…${transferTo.trim().slice(-4)}. They must accept it.`
        : "Transfer proposal rejected.";
    });
  }

  async function acceptTransfer() {
    await run(async () => {
      const tx = await walletClient(wallet!).accept_control({
        id: BigInt(splitId),
      });
      const { result } = await tx.signAndSend();
      return result.isOk() ? "Control accepted. You are now the controller." : "Accept failed.";
    });
  }

  async function cancelTransfer() {
    await run(async () => {
      const tx = await walletClient(wallet!).cancel_transfer({
        id: BigInt(splitId),
      });
      const { result } = await tx.signAndSend();
      return result.isOk() ? "Pending transfer cancelled." : "Cancel failed.";
    });
  }

  async function lock() {
    if (!confirmLock) {
      setConfirmLock(true);
      setMessage(t("lockConfirmPrompt"));
      return;
    }
    const id = splitId;
    await run(async () => {
      const tx = await walletClient(wallet!).transfer_control({
        id: BigInt(id),
        new_controller: undefined,
      });
      const { result } = await tx.signAndSend();
      if (!result.isOk()) return t("lockFailed");
      clearSelection();
      return t("lockSuccess");
    });
    setConfirmLock(false);
  }

  const isPendingTarget = pendingAddr === wallet;

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
          {pendingAddr && !isPendingTarget && (
            <p className="hint">
              Pending transfer to {pendingAddr.slice(0, 4)}…{pendingAddr.slice(-4)}.
            </p>
          )}
          {isPendingTarget && (
            <div className="row">
              <span className="hint">
                {pendingAddr.slice(0, 4)}…{pendingAddr.slice(-4)} is proposed as controller.
              </span>
              <button disabled={busy} onClick={acceptTransfer}>
                {busy && <span className="btn-spinner" />}
                Accept control
              </button>
              <button className="ghost" disabled={busy} onClick={cancelTransfer}>
                {busy && <span className="btn-spinner" />}
                Decline
              </button>
            </div>
          )}

          <RecipientEditor rows={rows} onChange={setRows} />
          <div className="row">
            <button disabled={busy} onClick={update}>
              {busy && <span className="btn-spinner" />}
              {t("updateButton")}
            </button>
          </div>
          <div className="row">
            <input
              placeholder={t("placeholderController")}
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              disabled={confirmLock}
            />
            <button className="ghost" disabled={busy || isPendingTarget} onClick={proposeTransfer}>
              {busy && <span className="btn-spinner" />}
              Propose transfer
            </button>
            {pendingAddr && (
              <button className="ghost" disabled={busy} onClick={cancelTransfer}>
                {busy && <span className="btn-spinner" />}
                Cancel transfer
              </button>
            )}
            <button className="ghost" disabled={busy} onClick={lock}>
              {busy && <span className="btn-spinner" />}
              {confirmLock ? t("confirmLockButton") : t("lockButton")}
            </button>
          </div>
          {confirmLock && (
            <div className="lock-confirm" role="alertdialog" aria-live="assertive">
              <p>
                <strong>Lock split #{splitId} permanently?</strong> Nobody —
                including you — will ever be able to edit its recipients,
                transfer control, or close it. This cannot be undone.
              </p>
              <div className="row">
                <button className="danger" disabled={busy} onClick={lock}>
                  Yes, lock it forever
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => setConfirmLock(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {message && <p className="note">{message}</p>}
    </section>
  );
}
