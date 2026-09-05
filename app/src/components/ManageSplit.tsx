import { useEffect, useMemo, useState } from "react";
import { walletClient, SplitView, Recipient } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import RecipientEditor, {
  Row,
  rowsError,
  toRecipient,
  toShares,
} from "./RecipientEditor";
import FeeHint from "./FeeHint";

function isPolicy(c: any): c is { threshold: number; signers: string[] } {
  return (
    c && typeof c === "object" && Array.isArray(c.signers) && typeof c.threshold === "number"
  );
}

function controllerSigners(controller: any): string[] {
  if (!controller) return [];
  if (typeof controller === "string") return [controller];
  if (isPolicy(controller)) return controller.signers;
  return [];
}

function formatController(c: any): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  if (isPolicy(c)) {
    return `${c.threshold}/${c.signers.length} [${c.signers.map((s) => s.slice(0, 4)).join(",")}]`;
  }
  return String(c);
}

function parseControllerInput(input: string): any {
  const trimmed = input.trim();
  if (/^[GC][A-Z2-7]{55}$/.test(trimmed)) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (isPolicy(parsed)) return parsed;
  } catch {}
  throw new Error("Invalid controller format");
}

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
  const [pendingTransfer, setPendingTransfer] = useState<any>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { t } = useTranslation();
  const mine = useMemo(
    () =>
      splits.filter((s) => wallet && controllerSigners(s.controller).includes(wallet)),
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
    if (!wallet || splitId === "") {
      setPendingTransfer(null);
      return;
    }

    let cancelled = false;
    walletClient(wallet)
      .pending_controller({ id: BigInt(splitId) })
      .then(({ result }: { result: any }) => {
        if (!cancelled) setPendingTransfer(result ?? null);
      })
      .catch(() => {
        if (!cancelled) setPendingTransfer(null);
      });

    return () => {
      cancelled = true;
    };
  }, [wallet, splitId]);

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
    setPendingTransfer(null);
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
    let to: any;
    try {
      to = parseControllerInput(transferTo);
    } catch {
      setMessage(t("controllerFormatError"));
      return;
    }
    if (typeof to === "string" && to === wallet) {
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
      if (!result.isOk()) return "Transfer proposal rejected.";
      setPendingTransfer(to);
      setTransferTo("");
      return `Transfer proposed to ${formatController(to)}. They must accept it.`;
    });
  }

  async function cancelTransfer() {
    await run(async () => {
      const tx = await walletClient(wallet!).cancel_transfer({
        id: BigInt(splitId),
      });
      const { result } = await tx.signAndSend();
      if (!result.isOk()) return "Transfer cancellation rejected.";
      setPendingTransfer(null);
      return "Transfer proposal cancelled.";
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

  const updateFee = useMemo(() => {
    if (rows.length === 0 || rowsError(rows, t)) {
      return null;
    }
    return () =>
      walletClient(wallet!).update_split({
        id: BigInt(splitId),
        recipients: rows.map(toRecipient),
        shares: toShares(rows),
      });
  }, [rows, wallet, splitId, t]);

  const transferFee = useMemo(() => {
    if (pendingTransfer !== null || !transferTo.trim()) return null;
    let newController: any;
    try {
      newController = parseControllerInput(transferTo);
    } catch {
      return null;
    }
    return () =>
      walletClient(wallet!).transfer_control({
        id: BigInt(splitId),
        new_controller: newController,
      });
  }, [pendingTransfer, transferTo, wallet, splitId]);

  const lockFee = useMemo(() => {
    return () =>
      walletClient(wallet!).transfer_control({
        id: BigInt(splitId),
        new_controller: undefined,
      });
  }, [wallet, splitId]);

  return (
    <section className="card">
      <h2>{t("manageTitle")}</h2>
      <div className="row">
        <label htmlFor="manage-split-select" className="visually-hidden">{t("chooseSplitControl")}</label>
        <select id="manage-split-select" value={splitId} onChange={(e) => select(e.target.value)}>
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
          <FeeHint assemble={updateFee} labelKey="estimatedUpdateFee" />
          <div className="row">
            <button disabled={busy} onClick={update}>
              {busy && <span className="btn-spinner" />}
              {t("updateButton")}
            </button>
          </div>
          <FeeHint assemble={transferFee} labelKey="estimatedTransferFee" />
          <div className="row">
            <label htmlFor="controller-input" className="visually-hidden">{t("placeholderController")}</label>
            <input
              id="controller-input"
              placeholder={t("placeholderController")}
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              disabled={confirmLock || pendingTransfer !== null}
            />
            <button
              className="ghost"
              disabled={busy || pendingTransfer !== null}
              onClick={proposeTransfer}
            >
              {busy && <span className="btn-spinner" />}
              Propose transfer
            </button>
            <button className="ghost" disabled={busy} onClick={lock}>
              {busy && <span className="btn-spinner" />}
              {confirmLock ? t("confirmLockButton") : t("lockButton")}
            </button>
          </div>
          {pendingTransfer !== null && (
            <div className="row" role="status">
              <span>
                Transfer pending to {formatController(pendingTransfer)}.
              </span>
              <button className="ghost" disabled={busy} onClick={cancelTransfer}>
                Cancel transfer
              </button>
            </div>
          )}
          <FeeHint assemble={lockFee} labelKey="estimatedLockFee" />
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
