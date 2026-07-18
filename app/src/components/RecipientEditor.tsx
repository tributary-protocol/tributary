import { useRef } from "react";
import { Recipient } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";

export interface Row {
  kind: "address" | "split";
  value: string;
  percent: string;
}

export function rowsTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => sum + (parseFloat(r.percent) || 0), 0);
}

export function rowsError(rows: Row[], t: (key: string) => string): string | null {
  if (Math.abs(rowsTotal(rows) - 100) > 0.001) {
    return t("sharesTotalError");
  }
  if (rows.some((r) => parseFloat(r.percent) <= 0 || isNaN(parseFloat(r.percent)))) {
    return t("sharesGreaterZeroError");
  }
  if (rows.some((r) => r.value.trim() === "")) {
    return t("recipientRequiredError");
  }
  if (
    rows.some(
      (r) => r.kind === "address" && !/^G[A-Z2-7]{55}$/.test(r.value.trim()),
    )
  ) {
    return t("recipientFormatError");
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

export function parseCsv(text: string): Row[] {
  const lines = text.trim().split("\n");
  const rows: Row[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (rows.length === 0 && /^(address|value|kind|split|recipient)/i.test(trimmed)) continue;
    const parts = trimmed.split(",");
    if (parts.length < 2) continue;
    const value = parts[0].trim();
    const percent = parts[1].trim();
    if (!value || !percent) continue;
    const kind = /^G[A-Z2-7]{55}$/.test(value) ? "address" : "split";
    rows.push({ kind, value, percent });
  }
  return rows;
}

export default function RecipientEditor({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  function setRow(i: number, patch: Partial<Row>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const total = rowsTotal(rows);

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const imported = parseCsv(text);
      if (imported.length > 0) onChange(imported);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

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
            <option value="address">{t("kindAddress")}</option>
            <option value="split">{t("kindSplit")}</option>
          </select>
          <input
            placeholder={row.kind === "address" ? t("placeholderAddress") : t("placeholderSplit")}
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
          <span className="unit" title="Percentage of the total payment this recipient receives. Stored on-chain as basis points (1% = 100 basis points).">% ⓘ</span>
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
          {t("addRecipient")}
        </button>
        <button className="ghost small" onClick={() => fileRef.current?.click()}>
          {t("importCsv")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleCsvFile}
          className="csv-input"
        />
        <span className={Math.abs(total - 100) < 0.001 ? "total ok" : "total"}>
          {t("pctOfTotal", { pct: Number(total.toFixed(2)).toString() })}
        </span>
      </div>
    </>
  );
}
