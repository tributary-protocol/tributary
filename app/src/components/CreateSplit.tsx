import { useMemo, useState } from "react";
import { walletClient } from "../lib/tributary";
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
  const [rows, setRows] = useState<Row[]>([
    { kind: "address", value: "", percent: "60" },
    { kind: "address", value: "", percent: "40" },
  ]);
  const [editable, setEditable] = useState(true);
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

  const assembleFee = useMemo(() => {
    if (!wallet || rowsError(rows)) return null;
    return () =>
      walletClient(wallet).create_split({
        creator: wallet,
        recipients: rows.map(toRecipient),
        shares: toShares(rows),
        controller: editable ? wallet : undefined,
      });
  }, [wallet, rows, editable]);

  const templates: [string, number[]][] = [
    ["50/50", [50, 50]],
    ["60/40", [60, 40]],
    ["Thirds", [33.34, 33.33, 33.33]],
    ["90/10", [90, 10]],
  ];

  async function submit() {
    if (!wallet) {
      setMessage("Connect your wallet first.");
      return;
    }
    const invalid = rowsError(rows);
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
        controller: editable ? wallet : undefined,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? `Split #${result.unwrap()} created.`
          : "Contract rejected the split.",
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
      <h2>Create a split</h2>
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
      <label className="check">
        <input
          type="checkbox"
          checked={editable}
          onChange={(e) => setEditable(e.target.checked)}
        />
        I can edit this split later (uncheck to lock it forever)
      </label>
      <FeeHint assemble={assembleFee} />
      <button disabled={busy} onClick={submit}>
        {busy ? "Waiting for signature…" : "Create split"}
      </button>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
