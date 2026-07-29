import { useEffect, useMemo, useState } from "react";
import {
  readClient,
  walletClient,
  toStroops,
  fromStroops,
  TOKENS,
  SplitView,
  shortAddress,
} from "../lib/tributary";
import { useTranslation } from "../lib/i18n";
import TokenPicker from "./TokenPicker";
import FeeHint from "./FeeHint";

interface StreamDetail {
  id: bigint;
  split_id: bigint;
  funder: string;
  token: string;
  amount: bigint;
  start_time: bigint;
  end_time: bigint;
  withdrawn: bigint;
  vested: bigint;
}

export default function StreamsCard({
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
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpStreamId, setTopUpStreamId] = useState<string | null>(null);

  const loadStreams = async () => {
    if (!wallet) {
      setStreams([]);
      return;
    }
    try {
      const client = readClient();
      const { result: streamIds } = await client.streams_of({ funder: wallet });
      const details = await Promise.all(
        streamIds.map(async (id: bigint) => {
          const { result: streamRes } = await client.get_stream({ id });
          const { result: vestedRes } = await client.vested_of({ id });
          if (streamRes.isErr()) return null;
          const s = streamRes.unwrap();
          return {
            id,
            split_id: s.split_id,
            funder: s.funder,
            token: s.token,
            amount: s.amount,
            start_time: s.start_time,
            end_time: s.end_time,
            withdrawn: s.withdrawn,
            vested: vestedRes.isOk() ? vestedRes.unwrap() : 0n,
          };
        })
      );
      setStreams(details.filter((d): d is StreamDetail => d !== null));
    } catch (e) {
      console.error("Failed to load streams", e);
    }
  };

  useEffect(() => {
    loadStreams();
  }, [wallet]);

  const assembleCreateFee = useMemo(() => {
    if (!wallet || splitId === "" || !amount || !startTime || !endTime) {
      return null;
    }
    const startSecs = BigInt(Math.floor(new Date(startTime).getTime() / 1000));
    const endSecs = BigInt(Math.floor(new Date(endTime).getTime() / 1000));
    if (startSecs >= endSecs) return null;
    return () =>
      walletClient(wallet).create_stream({
        funder: wallet,
        split_id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount, token.decimals),
        start_time: startSecs,
        end_time: endSecs,
      });
  }, [wallet, splitId, amount, token, startTime, endTime]);

  async function createStream() {
    if (!wallet) {
      setMessage(t("connectWalletFirst"));
      return;
    }
    if (splitId === "" || !amount || !startTime || !endTime) {
      setMessage("Please fill all fields.");
      return;
    }
    const startSecs = BigInt(Math.floor(new Date(startTime).getTime() / 1000));
    const endSecs = BigInt(Math.floor(new Date(endTime).getTime() / 1000));
    if (startSecs >= endSecs) {
      setMessage("Start time must be before end time.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.create_stream({
        funder: wallet,
        split_id: BigInt(splitId),
        token: token.contract,
        amount: toStroops(amount, token.decimals),
        start_time: startSecs,
        end_time: endSecs,
      });
      const { result } = await tx.signAndSend();
      if (result.isOk()) {
        setMessage(`Stream #${result.unwrap().toString()} successfully created!`);
        setAmount("");
        setStartTime("");
        setEndTime("");
        await loadStreams();
      } else {
        setMessage("Failed to create stream.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function withdrawVested(id: bigint) {
    if (!wallet) return;
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.withdraw_vested({ id });
      const { result } = await tx.signAndSend();
      if (result.isOk()) {
        setMessage(`Withdrew successfully.`);
        await loadStreams();
      } else {
        setMessage("Failed to withdraw vested tokens.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelStream(id: bigint) {
    if (!wallet) return;
    if (!confirm("Are you sure you want to cancel this stream? Unvested funds will be refunded.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.cancel_stream({ id });
      const { result } = await tx.signAndSend();
      if (result.isOk()) {
        setMessage("Stream cancelled successfully.");
        await loadStreams();
      } else {
        setMessage("Failed to cancel stream.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function topUp(id: bigint) {
    if (!wallet || !topUpAmount) return;
    setBusy(true);
    setMessage(null);
    try {
      const client = walletClient(wallet);
      const tx = await client.top_up({
        id,
        amount_to_add: toStroops(topUpAmount, token.decimals),
      });
      const { result } = await tx.signAndSend();
      if (result.isOk()) {
        setMessage("Topped up stream successfully.");
        setTopUpAmount("");
        setTopUpStreamId(null);
        await loadStreams();
      } else {
        setMessage("Failed to top up stream.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section className="card">
        <h2>Create a Vesting Stream</h2>
        <p className="hint">
          Locks funds and streams them linearly to split recipients over time.
        </p>
        <div className="row">
          <select value={splitId} onChange={(e) => setSplitId(e.target.value)}>
            <option value="">Choose target split</option>
            {splits.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                #{String(s.id)} · {s.recipients.length} recipients
              </option>
            ))}
          </select>
        </div>
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
        <div className="row" style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: "0.85em", opacity: 0.8, marginBottom: "4px" }}>Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: "0.85em", opacity: 0.8, marginBottom: "4px" }}>End Time</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <FeeHint assemble={assembleCreateFee} labelKey="estimatedDepositFee" />
        <button disabled={busy} onClick={createStream}>
          {busy && <span className="btn-spinner" />}
          {busy ? "Signing..." : "Create Stream"}
        </button>
        {message && <p className="note">{message}</p>}
      </section>

      {streams.length > 0 && (
        <section className="card">
          <h2>Active Streams</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
            {streams.map((s) => {
              const totalAmount = fromStroops(s.amount, token.decimals);
              const vestedAmount = fromStroops(s.vested, token.decimals);
              const withdrawnAmount = fromStroops(s.withdrawn, token.decimals);
              const remainingAmount = fromStroops(s.amount - s.withdrawn, token.decimals);
              const claimable = s.vested - s.withdrawn;

              return (
                <div key={String(s.id)} className="stream-item" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <strong>Stream #{String(s.id)} → Split #{String(s.split_id)}</strong>
                    <span className="badge">{token.code}</span>
                  </div>
                  <div style={{ fontSize: "0.9em", opacity: 0.9, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div><strong>Total Locked:</strong> {totalAmount} {token.code}</div>
                    <div><strong>Vested:</strong> {vestedAmount} {token.code} ({((Number(s.vested) / Number(s.amount)) * 100).toFixed(1)}%)</div>
                    <div><strong>Withdrawn:</strong> {withdrawnAmount} {token.code}</div>
                    <div><strong>Remaining:</strong> {remainingAmount} {token.code}</div>
                    <div style={{ fontSize: "0.85em", opacity: 0.7 }}>
                      {new Date(Number(s.start_time) * 1000).toLocaleString()} to {new Date(Number(s.end_time) * 1000).toLocaleString()}
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                    <button
                      className="small"
                      disabled={busy || claimable <= 0n}
                      onClick={() => withdrawVested(s.id)}
                    >
                      Withdraw Vested ({fromStroops(claimable > 0n ? claimable : 0n, token.decimals)})
                    </button>
                    <button
                      className="ghost small"
                      disabled={busy}
                      onClick={() => setTopUpStreamId(topUpStreamId === String(s.id) ? null : String(s.id))}
                    >
                      Top Up
                    </button>
                    <button
                      className="ghost small error"
                      disabled={busy}
                      onClick={() => cancelStream(s.id)}
                      style={{ color: "var(--red)" }}
                    >
                      Cancel
                    </button>
                  </div>

                  {topUpStreamId === String(s.id) && (
                    <div className="row" style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                      <input
                        type="number"
                        placeholder="Add amount"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                      />
                      <button className="small" onClick={() => topUp(s.id)} disabled={busy || !topUpAmount}>
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
