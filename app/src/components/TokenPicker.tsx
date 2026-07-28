import { useState } from "react";
import { Token, TOKENS, shortAddress } from "../lib/tributary";

const CONTRACT_RE = /^C[A-Z2-7]{55}$/;

export default function TokenPicker({
  token,
  onChange,
}: {
  token: Token;
  onChange: (t: Token) => void;
}) {
  const known = TOKENS.some((t) => t.contract === token.contract);
  const [custom, setCustom] = useState(!known);
  const [address, setAddress] = useState(known ? "" : token.contract);
  const [decimals, setDecimals] = useState(known ? 7 : token.decimals);

  function pick(value: string) {
    if (value === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    setAddress("");
    onChange(TOKENS.find((t) => t.code === value) ?? TOKENS[0]);
  }

  function setCustomAddress(value: string) {
    setAddress(value);
    const trimmed = value.trim();
    if (CONTRACT_RE.test(trimmed)) {
      onChange({ code: shortAddress(trimmed), contract: trimmed, decimals });
    }
  }

  function setCustomDecimals(value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0 && num <= 18) {
      setDecimals(num);
      const trimmed = address.trim();
      if (CONTRACT_RE.test(trimmed)) {
        onChange({ code: shortAddress(trimmed), contract: trimmed, decimals: num });
      }
    }
  }

  return (
    <>
      <select
        className="kind"
        value={custom ? "custom" : token.code}
        onChange={(e) => pick(e.target.value)}
      >
        {TOKENS.map((t) => (
          <option key={t.code} value={t.code}>
            {t.code}
          </option>
        ))}
        <option value="custom">Other…</option>
      </select>
      {custom && (
        <>
          <label htmlFor="token-contract" className="visually-hidden">
            Token contract address
          </label>
          <input
            id="token-contract"
            placeholder="C… token contract"
            value={address}
            onChange={(e) => setCustomAddress(e.target.value)}
            aria-label="Token contract address"
          />
          <label htmlFor="token-decimals" className="visually-hidden">
            Token decimals
          </label>
          <input
            id="token-decimals"
            type="number"
            min="0"
            max="18"
            placeholder="Decimals"
            value={decimals}
            onChange={(e) => setCustomDecimals(e.target.value)}
            aria-label="Token decimals (0-18)"
          />
        </>
      )}
    </>
  );
}