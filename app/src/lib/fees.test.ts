import { describe, expect, it } from "vitest";
import { AssembledTx, feeStroops } from "./fees";

function tx(builtFee: string | null, resourceFee: bigint): AssembledTx {
  return {
    ...(builtFee !== null && { built: { fee: builtFee } }),
    simulationData: {
      transactionData: { resourceFee: () => ({ toBigInt: () => resourceFee }) },
    },
  };
}

describe("feeStroops", () => {
  // Values captured from a real testnet `pay` simulation: the wallet was
  // shown 67220 stroops for a tx assembled with built.fee 33660 and
  // resource fee 33560, because sign() re-adds the resource fee.
  it("matches the fee the wallet displays: built fee + resource fee", () => {
    expect(feeStroops(tx("33660", 33560n))).toBe(67220n);
  });

  it("throws when the transaction was never assembled", () => {
    expect(() => feeStroops(tx(null, 33560n))).toThrow("assembled");
  });
});
