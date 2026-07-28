import test from "node:test";
import assert from "node:assert/strict";
import { decodeEvent, rpc, waitForConfirmation } from "./index.js";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";

const { Server: RpcServer, Api } = rpc;

// waitForConfirmation constructs its own RpcServer internally, so we stub the
// shared prototype method it ends up calling. t.mock.method restores it after
// each test. Poll/timeout values are kept tiny so the polling and timeout paths
// run in milliseconds.
const RPC_URL = "https://rpc.example.test";

test("decodeEvent decodes SplitCreated event from ScVal", () => {
  const topic = [
    nativeToScVal("SplitCreated"),
    nativeToScVal(123n),
  ];
  const value = nativeToScVal({
    creator: "GBXXXTST12345",
  });

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "SplitCreated",
    id: 123n,
    creator: "GBXXXTST12345",
  });
});

test("decodeEvent decodes SplitPaid event from base64 strings", () => {
  const topic = [
    nativeToScVal("SplitPaid").toXDR("base64"),
    nativeToScVal(456n).toXDR("base64"),
  ];
  const value = nativeToScVal({
    token: "GATOKEN12345",
    amount: 10000000n,
  }).toXDR("base64");

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "SplitPaid",
    id: 456n,
    token: "GATOKEN12345",
    amount: 10000000n,
  });
});

test("decodeEvent decodes SplitUpdated event with wrapper object", () => {
  const topic = [
    nativeToScVal("SplitUpdated"),
    nativeToScVal(789n),
  ];
  const value = {
    xdr: nativeToScVal(null).toXDR("base64"),
  };

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "SplitUpdated",
    id: 789n,
  });
});

test("decodeEvent decodes SplitClosed event", () => {
  const topic = [
    nativeToScVal("SplitClosed"),
    nativeToScVal(101n),
  ];
  const value = nativeToScVal(null);

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "SplitClosed",
    id: 101n,
  });
});

test("decodeEvent decodes ControlTransferred event with new controller address", () => {
  const topic = [
    nativeToScVal("ControlTransferred"),
    nativeToScVal(202n),
  ];
  const value = nativeToScVal({
    new_controller: "GNEWCONTROLLER123",
  });

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "ControlTransferred",
    id: 202n,
    new_controller: "GNEWCONTROLLER123",
  });
});

test("decodeEvent decodes ControlTransferred event with null new controller", () => {
  const topic = [
    nativeToScVal("ControlTransferred"),
    nativeToScVal(202n),
  ];
  const value = nativeToScVal({
    new_controller: null,
  });

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "ControlTransferred",
    id: 202n,
    new_controller: null,
  });
});

test("decodeEvent decodes Deposited event", () => {
  const topic = [
    nativeToScVal("Deposited"),
    nativeToScVal(303n),
  ];
  const value = nativeToScVal({
    token: "GDEPOSITTOKEN",
    amount: 5000n,
  });

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "Deposited",
    id: 303n,
    token: "GDEPOSITTOKEN",
    amount: 5000n,
  });
});

test("decodeEvent decodes Distributed event", () => {
  const topic = [
    nativeToScVal("Distributed"),
    nativeToScVal(404n),
  ];
  const value = nativeToScVal({
    token: "GDISTRIBUTETOKEN",
    amount: 9999n,
  });

  const decoded = decodeEvent({ topic, value });
  assert.deepEqual(decoded, {
    type: "Distributed",
    id: 404n,
    token: "GDISTRIBUTETOKEN",
    amount: 9999n,
  });
});

test("decodeEvent returns null for invalid or unrecognized events", () => {
  assert.equal(decodeEvent(null as any), null);
  assert.equal(decodeEvent({ topic: [], value: null }), null);
  assert.equal(decodeEvent({ topic: [nativeToScVal("UnknownEvent"), nativeToScVal(1n)], value: null }), null);
});

test("waitForConfirmation returns immediately on a successful transaction", async (t) => {
  const response = { status: Api.GetTransactionStatus.SUCCESS, marker: "ok" };
  const getTransaction = t.mock.method(
    RpcServer.prototype,
    "getTransaction",
    async () => response,
  );

  const result = await waitForConfirmation("txhash", {
    rpcUrl: RPC_URL,
    pollInterval: 5,
    timeout: 100,
  });

  assert.equal(result, response);
  assert.equal(result.status, Api.GetTransactionStatus.SUCCESS);
  assert.equal(getTransaction.mock.callCount(), 1);
});

test("waitForConfirmation returns immediately on a failed transaction", async (t) => {
  const response = { status: Api.GetTransactionStatus.FAILED, marker: "boom" };
  const getTransaction = t.mock.method(
    RpcServer.prototype,
    "getTransaction",
    async () => response,
  );

  const result = await waitForConfirmation("txhash", {
    rpcUrl: RPC_URL,
    pollInterval: 5,
    timeout: 100,
  });

  assert.equal(result, response);
  assert.equal(result.status, Api.GetTransactionStatus.FAILED);
  assert.equal(getTransaction.mock.callCount(), 1);
});

test("waitForConfirmation polls until the transaction is confirmed", async (t) => {
  const pending = { status: Api.GetTransactionStatus.NOT_FOUND };
  const success = { status: Api.GetTransactionStatus.SUCCESS };
  let calls = 0;
  const getTransaction = t.mock.method(
    RpcServer.prototype,
    "getTransaction",
    async () => {
      calls += 1;
      return calls < 3 ? pending : success;
    },
  );

  const result = await waitForConfirmation("txhash", {
    rpcUrl: RPC_URL,
    pollInterval: 5,
    timeout: 1_000,
  });

  assert.equal(result, success);
  // Two NOT_FOUND responses, then SUCCESS on the third poll.
  assert.equal(getTransaction.mock.callCount(), 3);
});

test("waitForConfirmation throws once the timeout deadline passes", async (t) => {
  const getTransaction = t.mock.method(
    RpcServer.prototype,
    "getTransaction",
    async () => ({ status: Api.GetTransactionStatus.NOT_FOUND }),
  );

  await assert.rejects(
    waitForConfirmation("txhash", {
      rpcUrl: RPC_URL,
      pollInterval: 10,
      timeout: 40,
    }),
    /Transaction txhash was not confirmed within/,
  );

  // It should have polled at least once before giving up.
  assert.ok(getTransaction.mock.callCount() >= 1);
});
