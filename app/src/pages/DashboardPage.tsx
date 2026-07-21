import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  fetchActivity,
  fetchMineIds,
  fetchSplits,
  ActivityItem,
  SplitView,
  splitPath,
} from "../lib/tributary";
import ActionPanel from "../components/ActionPanel";
import SplitList from "../components/SplitList";
import Activity from "../components/Activity";
import RefreshError from "../components/RefreshError";

const REFRESH_MS = 30_000;

const rise = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function DashboardPage({
  wallet,
}: {
  wallet: string | null;
}) {
  const navigate = useNavigate();
  const [splits, setSplits] = useState<SplitView[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextSplits, nextActivity, nextMine] = await Promise.all([
        fetchSplits(),
        fetchActivity().catch(() => [] as ActivityItem[]),
        wallet
          ? fetchMineIds(wallet).catch(() => new Set<string>())
          : Promise.resolve(new Set<string>()),
      ]);
      setSplits(nextSplits);
      setActivity(nextActivity);
      setMine(nextMine);
      setError(null);
      setRefreshError(null);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (loading) {
        setError(errorMsg);
      } else {
        setRefreshError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, loading]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <>
      <motion.section
        className="intro"
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <h1>Split payments on Stellar</h1>
        <p>
          One transaction in, every recipient paid by their share. Running on
          testnet.
        </p>
      </motion.section>

      {error && <div className="error">{error}</div>}

      <AnimatePresence>
        {refreshError && (
          <RefreshError
            error={refreshError}
            onRetry={refresh}
            onDismiss={() => setRefreshError(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
      >
        <ActionPanel wallet={wallet} splits={splits} onChanged={refresh} />
      </motion.div>

      <motion.div
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.16 }}
      >
        <SplitList
          splits={splits}
          loading={loading}
          mine={mine}
          onOpenSplit={(id) => navigate(splitPath(id))}
        />
      </motion.div>

      <Activity items={activity} />
    </>
  );
}
