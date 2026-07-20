import { Recipient } from "../lib/tributary";
import Tooltip from "./Tooltip";

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
    return t ? t("sharesTotalError") : "Shares must add up to 100%.";
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
  if (hasDuplicateRecipients(rows)) {
    return t ? t("duplicateRecipientError") : "Duplicate recipients: the same address appears more than once.";
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

/**
 * Returns a Set of normalised address values that appear more than once
 * across address-type rows. Used to highlight duplicates inline.
 */
export function duplicateAddresses(rows: Row[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "address") continue;
    const key = r.value.trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [key, count] of seen) {
    if (count > 1) dupes.add(key);
  }
  return dupes;
}

/** Returns true if any address-type recipient is duplicated. */
export function hasDuplicateRecipients(rows: Row[]): boolean {
  return duplicateAddresses(rows).size > 0;
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
  const dupes = duplicateAddresses(rows);

  return (
    <>
      <div className="field-help">
        <span>Recipient shares</span>
        <Tooltip label="basis points">
          Shares are stored in basis points: 1 basis point is 0.01%, so 10,000
          basis points equals 100%. Enter shares here as percentages.
        </Tooltip>
      </div>
      {rows.map((row, i) => {
        const isDupe =
          row.kind === "address" && dupes.has(row.value.trim());
        return (
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
              className={isDupe ? "dupe-input" : undefined}
              placeholder={row.kind === "address" ? "G… recipient address" : "Split id"}
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
            {isDupe && (
              <span
                className="dupe-warn"
                title="This address is already listed as a recipient."
                aria-label="Duplicate recipient"
              >
                ⚠
              </span>
            )}
            <input
              className="pct"
              type="number"
              aria-label={`Recipient ${i + 1} share percentage`}
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
        );
      })}
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
      {dupes.size > 0 && (
        <p className="note dupe-note">
          ⚠ Duplicate recipient{dupes.size > 1 ? "s" : ""}: the same address
          appears more than once.
        </p>
      )}
    </>
  );
}

