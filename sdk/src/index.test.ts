import test from "node:test";
import assert from "node:assert/strict";
import { decodeEvent } from "./index.js";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";

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
