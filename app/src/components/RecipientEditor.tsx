import { Recipient } from "../lib/tributary";

export interface Row {
  kind: "address" | "split";
  value: string;
  percent: string;
}

export function rowsTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => sum + (parseFloat(r.percent) || 0), 0);
}

export function rowsError(
  rows: Row[],
  t?: (key: string, variables?: Record<string, string | number>) => string,
): string | null {
  if (Math.abs(rowsTotal(rows) - 100) > 0.001) {
    return t ? t("shareTotalError") : "Shares must add up to 100%.";
  }
  if (rows.some((r) => r.value.trim() === "")) {
    return t ? t("emptyRecipientError") : "Every recipient needs an address or split id.";
  }
  if (
    rows.some(
      (r) => r.kind === "address" && !/^G[A-Z2-7]{55}$/.test(r.value.trim()),
    )
  ) {
    return t ? t("invalidAddressError") : "Recipient addresses must be G… account keys.";
  }
  return null;
}

export function toRecipient(row: Row): Recipient {
  return row.kind === "address"
    ? { tag: "Account", values: [row.value.trim()] }
    : { tag: "Split", values: [BigInt(row.value)] };
}

export function toShares(rows: Row[]): number[] {
  return rows.map((r) => Math.round(parseFloat(r.percent) * 100));
}

export default function RecipientEditor({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  function setRow(i: number, patch: Partial<Row>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const total = rowsTotal(rows);

  return (
    <>
      {rows.map((row, i) => (
        <div className="row" key={i}>
          <select
            className="kind"
            value={row.kind}
            onChange={(e) =>
              setRow(i, { kind: e.target.value as Row["kind"], value: "" })
            }
          >
            <option value="address">Address</option>
            <option value="split">Split</option>
          </select>
          <input
            placeholder={row.kind === "address" ? "G… recipient address" : "Split id"}
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
          />
          <input
            className="pct"
            type="number"
            min="0"
            max="100"
            value={row.percent}
            onChange={(e) => setRow(i, { percent: e.target.value })}
          />
          <span className="unit">%</span>
          {rows.length > 1 && (
            <button
              className="ghost"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label="Remove recipient"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="row actions">
        <button
          className="ghost"
          onClick={() =>
            onChange([...rows, { kind: "address", value: "", percent: "" }])
          }
        >
          Add recipient
        </button>
        <span className={Math.abs(total - 100) < 0.001 ? "total ok" : "total"}>
          {Number(total.toFixed(2))}% of 100%
        </span>
      </div>
    </>
  );
}
