import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  fromStroops,
  readClient,
  recipientLabel,
  SplitView,
  TOKENS,
} from "../lib/tributary";

export default function SplitDetails({ split }: { split: SplitView }) {
  const [balances, setBalances] = useState<{ code: string; amount: bigint }[]>(
    [],
  );

  useEffect(() => {
    let active = true;
    setBalances([]);
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
    return () => {
      active = false;
    };
  }, [split.id]);

  return (
    <motion.div
      className="split-details"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {split.recipients.map((r, i) => (
        <div className="detail-row" key={i}>
          <span className="mono">{recipientLabel(r)}</span>
          <span>{(split.shares[i] / 100).toFixed(2).replace(/\.?0+$/, "")}%</span>
        </div>
      ))}
      {split.controller && (
        <div className="detail-row">
          <span>controller</span>
          <span className="mono">{split.controller}</span>
        </div>
      )}
      {balances.length > 0 ? (
        balances.map((b) => (
          <div className="detail-row" key={b.code}>
            <span>escrow</span>
            <span>
              {fromStroops(b.amount)} {b.code}
            </span>
          </div>
        ))
      ) : (
        <div className="detail-row">
          <span>escrow</span>
          <span>empty</span>
        </div>
      )}
    </motion.div>
  );
}
