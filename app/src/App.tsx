import { useCallback, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { motion } from "motion/react";
import {
  CONTRACT_ID,
  EXPLORER,
  connectWallet,
  shortAddress,
} from "./lib/tributary";
import { useTranslation } from "./lib/i18n";
import DashboardPage from "./pages/DashboardPage";
import SplitPage from "./pages/SplitPage";
import LanguageSwitcher from "./components/LanguageSwitcher";

export default function App() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

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
      setBackgroundError(null);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (loading) {
        // Initial load failure - show blocking error
        setError(errorMsg);
      } else {
        // Background refresh failure - show non-blocking indicator
        setBackgroundError(errorMsg);
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

  async function onConnect() {
  const onConnect = useCallback(async () => {
    try {
      setWallet(await connectWallet());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <div className="page">
      <header>
        <Link to="/" className="brand" aria-label="Tributary home">
          <img src="/logo.svg" alt="" width="34" height="34" />
          <span>Tributary</span>
          <span className="badge net">{t("testnet")}</span>
        </Link>
        <nav>
          <LanguageSwitcher />
          <a href="https://github.com/tributary-protocol/tributary">
            {t("github")}
          </a>
          {wallet ? (
            <span className="wallet">{shortAddress(wallet)}</span>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={onConnect}>
              {t("connectWallet")}
            </motion.button>
          )}
        </nav>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage wallet={wallet} />} />
          <Route path="/split/:id" element={<SplitPage wallet={wallet} />} />
          <Route
            path="*"
            element={
              <div className="empty">
                <p>Page not found.</p>
                <p className="note">
                  Open the dashboard or jump straight to a split by URL.
                </p>
                <Link className="ghost-link" to="/">
                  Back to list
                </Link>
              </div>
            }
          />
        </motion.div>

        <motion.div
          {...rise}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.16 }}
        >
          <SplitList splits={splits} loading={loading} mine={mine} />
        </motion.div>

        {backgroundError && (
          <div className="background-error">
            <span>{t("refreshFailed")}</span>
            <button onClick={() => refresh()}>{t("retryButton")}</button>
            <button className="ghost" onClick={() => setBackgroundError(null)}>
              {t("dismissButton")}
            </button>
          </div>
        )}

        <Activity items={activity} />
        </Routes>
      </main>

      <footer>
        <span>Apache-2.0</span>
        <a href={`${EXPLORER}/contract/${CONTRACT_ID}`}>
          {t("contractOnTestnet")}
        </a>
        <a href="https://github.com/tributary-protocol/tributary">
          tributary-protocol/tributary
        </a>
      </footer>
    </div>
  );
}
