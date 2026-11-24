import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { CONTRACT_ID, EXPLORER, fetchSplitById, splitPath, SplitView } from "../lib/tributary";
import ActionPanel from "../components/ActionPanel";
import SplitDetails from "../components/SplitDetails";
import SplitNotFound from "../components/SplitNotFound";

const rise = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function parseSplitId(rawId: string | undefined): bigint | null {
  if (!rawId || !/^\d+$/.test(rawId)) return null;
  try {
    return BigInt(rawId);
  } catch {
    return null;
  }
}

export default function SplitPage({
  wallet,
}: {
  wallet: string | null;
}) {
  const params = useParams<{ id: string }>();
  const rawId = params.id ?? "";
  const splitId = parseSplitId(rawId);
  const [split, setSplit] = useState<SplitView | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSplit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissing(false);
    setMessage(null);

    if (splitId === null) {
      setSplit(null);
      setMissing(true);
      setLoading(false);
      return;
    }

    try {
      const next = await fetchSplitById(splitId);
      setSplit(next);
      if (!next) {
        setMissing(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [splitId]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await loadSplit();
      if (!active) return;
    };
    run();
    return () => {
      active = false;
    };
  }, [loadSplit]);

  const copyLink = useCallback(async () => {
    if (!split) return;
    const url = new URL(splitPath(split.id), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Split link copied to clipboard.");
    } catch {
      setMessage("Could not copy the split link.");
    }
  }, [split]);

  if (loading) {
    return <p className="note">Loading split…</p>;
  }

  if (missing) {
    return <SplitNotFound id={rawId || "unknown"} />;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!split) {
    return <SplitNotFound id={rawId || "unknown"} />;
  }

  return (
    <>
      <motion.section
        className="intro split-intro"
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="split-kicker">
          <span className="badge">Split #{String(split.id)}</span>
          <span className="badge">{split.controller ? "mutable" : "locked"}</span>
        </div>
        <h1>Split #{String(split.id)}</h1>
        <p>
          Share this URL to let someone pay, manage, or inspect the split
          directly.
        </p>
        <div className="split-actions">
          <button className="ghost" onClick={copyLink}>
            Copy link
          </button>
          <Link className="ghost-link" to="/">
            Back to list
          </Link>
          <a className="ghost-link" href={`${EXPLORER}/contract/${CONTRACT_ID}`}>
            Contract on testnet
          </a>
        </div>
      </motion.section>

      {message && <p className="note">{message}</p>}

      <motion.section
        className="card split-card"
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
      >
        <h2>Split details</h2>
        <SplitDetails split={split} />
      </motion.section>

      <motion.div
        {...rise}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.16 }}
      >
        <ActionPanel
          wallet={wallet}
          splits={[split]}
          selectedSplitId={String(split.id)}
          onChanged={loadSplit}
        />
      </motion.div>
    </>
  );
}
