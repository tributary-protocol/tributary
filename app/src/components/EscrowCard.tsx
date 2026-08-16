import { useEffect, useMemo, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  tokenCode,
  fetchHeldTokens,
  TOKENS,
  SplitView,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";
import FeeHint from "./FeeHint";

interface TokenBalance {
  contract: string;
  code: string;
  balance: bigint;
}

export default function EscrowCard({
  wallet,
  splits,
  selectedSplitId,
}: {
  wallet: string | null;
  splits: SplitView[];
  selectedSplitId?: string;
}) {
  const { t } = useTranslation();
  const [splitId, setSplitId] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(TOKENS[0]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [distributing, setDistributing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSplitId !== undefined) {
      setSplitId(selectedSplitId);
    }
  }, [selectedSplitId]);

  async function loadPending(id: string) {
    if (id === "") {
      setBalances([]);
      setLoadError(null);
      return;
    }
    setLoadError(null);
    try {
      const tokens = await fetchHeldTokens(BigInt(id));
      if (tokens.length === 0) {
        setBalances([]);
        return;
      }
      const items = await Promise.all(
        tokens.map(async (contract) => {
          const { result } = await readClient().balance({
            id: BigInt(id),
            token: contract,
          });
          return {
            contract,
            code: tokenCode(contract),
            balance: result,
          };
        }),
      );
      // Filter out any zero balances that may have been cleared since fetchHeldTokens ran
      setBalances(items.filter((tk) => tk.balance > 0n));
    } catch {
      setLoadError("Failed to load pending balances.");
      setBalances([]);
    }
  }

  useEffect(() => {
    loadBalances(splitId);
  }, [splitId]);

  const depositFee = useMemo(() => {
    if (!wallet || splitId === "" || !amount || parseFloat(amount) <= 0) {
      return null;
    }
    return () =>
      walletClient(wallet).deposit({
        from: wallet,
        id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount),
      });
  }, [wallet, splitId, amount, token]);

  const distributeFee = useMemo(() => {
    if (!wallet || splitId === "" || !pending) return null;
    return () =>
      walletClient(wallet).distribute({
        id: BigInt(splitId),
        token: token.contract,
      });
  }, [wallet, splitId, token, pending]);

  async function distribute() {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    setDistributing(contract);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.distribute({
        id: BigInt(splitId),
        token: contract,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? t("distributeSuccess", { amount: fromStroops(result.unwrap()), token: code })
          : t("distributeFailed"),
      );
      await loadBalances(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDistributing(null);
    }
  }

  async function deposit() {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "" || !amount) {
      setMessage(t("pickSplitAndAmount"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.deposit({
        from: wallet,
        id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount),
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? t("depositSuccess", { amount, token: token.code })
          : t("depositFailed"),
      );
      await loadBalances(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("escrowTitle")}</h2>
      <p className="hint">
        {t("escrowDesc")}
      </p>
      <div className="row">
        <select value={splitId} onChange={(e) => setSplitId(e.target.value)}>
          <option value="">{t("chooseSplit")}</option>
          {splits.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              #{String(s.id)} · {t("recipientsCount", { count: s.recipients.length })}
            </option>
          ))}
        </select>
      </div>

      {splitId !== "" && (
        <div className="escrow-balances">
          {loadError && <p className="note">{loadError}</p>}
          {!loadError && balances.length === 0 && (
            <p className="hint">No pending balances.</p>
          )}
          {balances.map((tk) => (
            <div className="row" key={tk.contract}>
              <span className="hint">
                {t("pending", { amount: fromStroops(tk.balance), token: tk.code })}
              </span>
              <button
                className="ghost"
                disabled={distributing === tk.contract}
                onClick={() => distribute(tk.contract, tk.code)}
              >
                {distributing === tk.contract ? t("working") : t("distributeButton")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <input
          type="number"
          min="0"
          step="0.0000001"
          placeholder={t("amount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TokenPicker token={token} onChange={setToken} />
      </div>
      <FeeHint assemble={depositFee} labelKey="estimatedDepositFee" />
      <FeeHint assemble={distributeFee} labelKey="estimatedDistributeFee" />
      <div className="row">
        <button disabled={busy} onClick={deposit}>
          {busy && <span className="btn-spinner" />}
          {busy ? t("working") : t("depositButton")}
        </button>
        <button
          className="ghost"
          disabled={busy || !pending}
          onClick={distribute}
        >
          {busy && <span className="btn-spinner" />}
          {busy ? t("working") : t("distributeButton")}
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
