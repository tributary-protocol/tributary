import { useState } from "react";
import { motion } from "motion/react";
import { EXPLORER, recipientLabel, SplitView } from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import { CopyButton } from "./CopyButton";

export default function SplitList({
  splits,
  loading,
  mine,
  onOpenSplit,
}: {
  splits: SplitView[];
  loading: boolean;
  mine: Set<string>;
  onOpenSplit: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  if (loading) return <p className="note">{t("loadingSplits")}</p>;

  if (splits.length === 0) {
    return (
      <div className="empty">
        <p>{t("noSplitsOnContract")}</p>
        <p className="note">{t("noSplitsPrompt")}</p>
      </div>
    );
  }

  const searchLower = search.toLowerCase();
  const filteredSplits = splits.filter((s) => {
    if (!searchLower) return true;
    if (String(s.id).includes(searchLower)) return true;
    return s.recipients.some((r) =>
      String(r.values[0]).toLowerCase().includes(searchLower)
    );
  });

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Recent splits</h2>
        <input
          type="text"
          placeholder="Search by ID or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #444", background: "#1a1a1a", color: "inherit" }}
        />
      </div>
      <div className="splits">
        {filteredSplits.length === 0 && (
          <p className="note">No splits match your search.</p>
        )}
        {filteredSplits.map((s, index) => {
          const key = String(s.id);
          return (
            <motion.div
              className="split"
              key={key}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
              whileHover={{ y: -2 }}
              role="button"
              tabIndex={0}
              aria-label={`Open split #${key}`}
              onClick={() => onOpenSplit(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenSplit(key);
                }
              }}
            >
              <div className="split-head">
                <span className="split-id">#{key}</span>
                <CopyButton text={String(key)}>{t("copy")}</CopyButton>
                <span>
                  {mine.has(key) && (
                    <span className="badge own">{t("yours")}</span>
                  )}
                  <span className="badge">
                    {s.controller ? t("mutable") : t("locked")}
                  </span>
                </span>
              </div>
              <ul>
                {s.recipients.map((r, i) => (
                  <li key={i}>
                    {r.tag === "Account" ? (
                      <>
                        <a
                          href={`${EXPLORER}/account/${r.values[0]}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {recipientLabel(r)}
                        </a>
                        <CopyButton text={r.values[0]}>{t("copy")}</CopyButton>
                      </>
                    ) : (
                      <span className="nested">
                        {t("nestedSplit", { id: r.values[0].toString() })}
                      </span>
                    )}
                    <span>
                      {(s.shares[i] / 100).toFixed(2).replace(/\.?0+$/, "")}%
                    </span>
                  </li>
                ))}
              </ul>
              <p className="note">
                Open this split to see balances, copy a link, pay it or manage
                it.
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
