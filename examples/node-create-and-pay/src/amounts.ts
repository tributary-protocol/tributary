/**
 * Amount conversion for the native XLM asset and its testnet contract id.
 */

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

// The Stellar Asset Contract for native XLM. Stable across tools that
// target testnet (also used by app/src/lib/tributary.ts).
export const XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export class AmountError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

// Stellar classic assets always use 7 decimals through their SAC.
export function toStroops(units: string): bigint {
  if (typeof units !== "string" || !/^\d+\.?\d*$|^\.\d+$/.test(units)) {
    throw new AmountError(
      `Invalid amount: "${units}". Use a plain decimal number with no sign or exponent.`,
    );
  }
  const [whole, frac = ""] = units.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  const stroops = BigInt(whole || "0") * 10_000_000n + BigInt(padded);
  if (stroops <= 0n) {
    throw new AmountError(`Amount must be greater than zero, got "${units}"`);
  }
  return stroops;
}

export function fromStroops(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 7,
  });
}
