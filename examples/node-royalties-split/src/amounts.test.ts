import { test } from "node:test";
import assert from "node:assert/strict";
import { toStroops, fromStroops, AmountError } from "./amounts.js";

test("toStroops converts whole XLM amounts", () => {
  assert.equal(toStroops("1"), 10_000_000n);
  assert.equal(toStroops("42"), 420_000_000n);
});

test("toStroops converts fractional amounts", () => {
  assert.equal(toStroops("0.5"), 5_000_000n);
  assert.equal(toStroops(".25"), 2_500_000n);
  assert.equal(toStroops("1.1234567"), 11_234_567n);
});

test("toStroops truncates beyond 7 decimal places", () => {
  assert.equal(toStroops("1.123456789"), 11_234_567n);
});

test("toStroops rejects non-numeric input", () => {
  assert.throws(() => toStroops("abc"), AmountError);
  assert.throws(() => toStroops("1e5"), AmountError);
  assert.throws(() => toStroops("-1"), AmountError);
  assert.throws(() => toStroops(""), AmountError);
});

test("toStroops rejects zero", () => {
  assert.throws(() => toStroops("0"), AmountError);
  assert.throws(() => toStroops("0.0"), AmountError);
});

test("fromStroops formats stroops back into XLM", () => {
  assert.equal(fromStroops(10_000_000n), "1");
  assert.equal(fromStroops(5_000_000n), "0.5");
  assert.equal(fromStroops(11_234_567n), "1.1234567");
});
