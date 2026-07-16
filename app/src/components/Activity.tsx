import { AnimatePresence, motion } from "motion/react";
import { fromStroops, tokenCode, relativeTime, ledgerTimestamp, ActivityItem, EXPLORER } from "../lib/tributary";

const LABELS: Record<string, string> = {
  split_created: "created",
  split_paid: "paid",
  split_updated: "updated",
  deposited: "deposit",
  distributed: "distributed",
  control_transferred: "control moved",
};

export default function Activity({ items, latestLedger }: { items: ActivityItem[]; latestLedger: number }) {
  if (items.length === 0) return null;

  const exportCSV = () => {
    const header = "eventId,type,id,amount,token,ledger,txHash";
    const rows = items.map((item) => {
      const amount = item.amount !== undefined ? fromStroops(item.amount) : "";
      const token = item.token ?? "";
      const id = item.id !== undefined ? item.id.toString() : "";
      return `${item.eventId},${item.type},${id},${amount},${token},${item.ledger},${item.txHash}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.section
      className="activity"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2>Recent activity</h2>
      <button onClick={exportCSV}>Export CSV</button>
      <ul>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.eventId}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span className="badge">{LABELS[item.type] ?? item.type}</span>
              <span>
                {item.id !== undefined && `split #${String(item.id)}`}
                {item.amount !== undefined &&
                  ` · ${fromStroops(item.amount)} ${tokenCode(item.token)}`}
              </span>
              <a
                href={`${EXPLORER}/tx/${item.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                tx
              </a>
              {latestLedger > 0 && (
                <span
                  className="timestamp"
                  title={ledgerTimestamp(item.ledger, latestLedger)}
                >
                  {relativeTime(item.ledger, latestLedger)}
                </span>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
