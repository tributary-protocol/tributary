import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  readClient,
  recipientLabel,
  fromStroops,
  SplitView,
  TOKENS,
  EXPLORER,
  fetchActivityForSplit,
  ActivityItem,
  tokenCode,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import { CopyButton } from "./CopyButton";

function Detail({ split }: { split: SplitView }) {
  const { t } = useTranslation();
  const [balances, setBalances] = useState<{ code: string; amount: bigint }[]>([]);
  const [history, setHistory] = useState<ActivityItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    Promise.all(
      TOKENS.map(async (t) => {
        const { result } = await readClient().balance({
          id: split.id,
          token: t.contract,
        });
        return { code: t.code, amount: result };
      }),
    ).then((all) => {
      if (active) setBalances(all.filter((b) => b.amount > 0n));
    });

    fetchActivityForSplit(split.id)
      .then((items) => {
        if (active) {
          setHistory(items);
          setLoadingHistory(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch split activity history:", err);
        if (active) setLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, [split.id]);

  return (
    <motion.div
      className="detail"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{ overflow: "hidden" }}
    >
      {split.recipients.map((r, i) => (
        <div className="detail-row" key={i}>
          <span className="mono">
            {r.tag === "Account" ? r.values[0] : t("nestedSplit", { id: r.values[0].toString() })}
          </span>
          <span>{(split.shares[i] / 100).toFixed(2).replace(/\.?0+$/, "")}%</span>
        </div>
      ))}
      {split.controller && (
        <div className="detail-row">
          <span className="mono">{t("detailController", { controller: split.controller })}</span>
        </div>
      )}
      {balances.map((b) => (
        <div className="detail-row" key={b.code}>
          <span>{t("detailEscrow")}</span>
          <span>
            {fromStroops(b.amount)} {b.code}
          </span>
        </div>
      ))}

      <div className="detail-history">
        <h4 className="detail-history-title">{t("detailHistoryTitle")}</h4>
        {loadingHistory ? (
          <p className="detail-history-loading">{t("detailHistoryLoading")}</p>
        ) : history.length === 0 ? (
          <p className="detail-history-empty">{t("detailHistoryEmpty")}</p>
        ) : (
          <ul className="detail-history-list">
            {history.map((item) => (
              <li key={item.eventId} className="detail-history-item">
                <span className={`badge-history ${item.type}`}>
                  {item.type === "split_paid" ? t("activityPaid") : t("activityDistributed")}
                </span>
                <span className="history-amount">
                  {item.amount !== undefined && `${fromStroops(item.amount)} ${tokenCode(item.token)}`}
                </span>
                <a
                  href={`${EXPLORER}/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="history-tx-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("activityTx")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

export default function SplitList({
  splits,
  loading,
  mine,
}: {
  splits: SplitView[];
  loading: boolean;
  mine: Set<string>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  if (loading) return <p className="note">{t("loadingSplits")}</p>;
  if (splits.length === 0) {
    return (
      <div className="empty">
        <p>{t("noSplitsOnContract")}</p>
        <p className="note">
          {t("noSplitsPrompt")}
        </p>
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
              onClick={() => setOpen(open === key ? null : key)}
            >
              <div className="split-head">
                <span className="split-id">#{key}</span>
                <CopyButton text={String(key)}>
                  {t("copy")}
                </CopyButton>
                <span>
                  {mine.has(key) && <span className="badge own">{t("yours")}</span>}
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
                        <CopyButton text={r.values[0]}>
                          {t("copy")}
                        </CopyButton>
                      </>
                    ) : (
                      <span className="nested">{t("nestedSplit", { id: r.values[0].toString() })}</span>
                    )}
                    <span>{(s.shares[i] / 100).toFixed(2).replace(/\.?0+$/, "")}%</span>
                  </li>
                ))}
              </ul>
              <AnimatePresence>
                {open === key && <Detail split={s} />}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
