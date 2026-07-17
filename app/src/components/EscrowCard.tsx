import { useEffect, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  TOKENS,
  Token,
  SplitView,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";

export default function EscrowCard({
  wallet,
  splits,
}: {
  wallet: string | null;
  splits: SplitView[];
}) {
  const { t } = useTranslation();
  const [splitId, setSplitId] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(TOKENS[0]);
  const [pendingBalances, setPendingBalances] = useState<Record<string, bigint>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAllPending(id: string) {
    if (id === "") {
      setPendingBalances({});
      return;
    }
    const results: Record<string, bigint> = {};
    await Promise.all(
      TOKENS.map(async (tk) => {
        try {
          const { result } = await readClient().balance({
            id: BigInt(id),
            token: tk.contract,
          });
          if (result > 0n) {
            results[tk.contract] = result;
          }
        } catch {
          // no balance for this token
        }
      }),
    );
    setPendingBalances(results);
  }

  useEffect(() => {
    loadAllPending(splitId);
  }, [splitId]);

  async function distributeToken(tk: Token) {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "") {
      setMessage(t("pickSplit"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.distribute({
        id: BigInt(splitId),
        token: tk.contract,
      });
      const { result } = await tx.signAndSend();
      setMessage(
        result.isOk()
          ? t("distributeSuccess", { amount: fromStroops(result.unwrap()), token: tk.code })
          : t("distributeFailed"),
      );
      await loadAllPending(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
      await loadAllPending(splitId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const pendingTokens = TOKENS.filter((tk) => pendingBalances[tk.contract] !== undefined);

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
      {pendingTokens.map((tk) => (
        <div key={tk.contract} className="row">
          <p className="hint" style={{ flex: 1, margin: 0 }}>
            {t("pending", { amount: fromStroops(pendingBalances[tk.contract]), token: tk.code })}
          </p>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => distributeToken(tk)}
          >
            {t("distributeButton")}
          </button>
        </div>
      ))}
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
      <div className="row">
        <button disabled={busy} onClick={deposit}>
          {busy ? t("working") : t("depositButton")}
        </button>
      </div>
      {message && <p className="note">{message}</p>}
    </section>
  );
}
