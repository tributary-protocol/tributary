import { useState } from "react";
import {
  walletClient,
  SplitView,
  Recipient,
  shortAddress,
} from "../lib/tributary";
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
    setConfirmLock(false);
    const invalid = rowsError(rows);
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
      return result.isOk() ? "Split updated." : "Update rejected.";
    });
  }

  async function transfer() {
    setConfirmLock(false);
    const to = transferTo.trim();
    if (!/^G[A-Z2-7]{55}$/.test(to)) {
      setMessage("Controller must be a G… account key.");
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
      if (!result.isOk()) return "Transfer rejected.";
      clearSelection();
      return `Control of split #${id} handed to ${shortAddress(to)}.`;
    });
  }

  async function lock() {
    const id = splitId;
    await run(async () => {
      const tx = await walletClient(wallet!).transfer_control({
        id: BigInt(id),
        new_controller: undefined,
      });
      const { result } = await tx.signAndSend();
      if (!result.isOk()) return "Lock rejected.";
      clearSelection();
      return `Split #${id} is locked. Its recipients can never change again.`;
    });
    setConfirmLock(false);
  }

  return (
    <section className="card">
      <h2>Manage your splits</h2>
      <div className="row">
        <select value={splitId} onChange={(e) => select(e.target.value)}>
          <option value="">Choose split you control</option>
          {mine.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {s.recipients.length} recipients
            </option>
          ))}
        </select>
      </div>
      {splitId !== "" && (
        <>
          <RecipientEditor rows={rows} onChange={setRows} />
          <div className="row">
            <button disabled={busy} onClick={update}>
              Update split
            </button>
          </div>
          <div className="row">
            <input
              placeholder="G… new controller"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              disabled={confirmLock}
            />
            <button
              className="ghost"
              disabled={busy || confirmLock}
              onClick={transfer}
            >
              Transfer
            </button>
            <button
              className="ghost"
              disabled={busy || confirmLock}
              onClick={() => {
                setConfirmLock(true);
                setMessage(null);
              }}
            >
              Lock forever
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
