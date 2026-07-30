// A contract client call returns an already-simulated transaction whose
// built fee is inclusion fee + Soroban resource fee. But stellar-sdk's
// `sign()` re-builds the transaction before handing it to the wallet,
// passing that total as the new per-operation base fee, and `build()`
// then adds the resource fee on top once more. The wallet therefore shows
// (and the network is offered) built.fee + resourceFee. Mirror that math
// here so the estimate matches the wallet prompt exactly.
export interface AssembledTx {
  built?: { fee: string };
  simulationData: {
    transactionData: { resourceFee(): { toBigInt(): bigint } };
  };
}

export function feeStroops(tx: AssembledTx): bigint {
  if (!tx.built) throw new Error("Transaction has not been assembled.");
  return (
    BigInt(tx.built.fee) +
    tx.simulationData.transactionData.resourceFee().toBigInt()
  );
}
