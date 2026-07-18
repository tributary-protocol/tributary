import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateShares,
  sharesFromWeights,
  InvalidSharesError,
  TOTAL_BASIS_POINTS,
} from "./shares.js";

test("validateShares accepts shares that sum to 10_000", () => {
  assert.doesNotThrow(() => validateShares([5_000, 3_000, 2_000]));
  assert.doesNotThrow(() => validateShares([TOTAL_BASIS_POINTS]));
});

test("validateShares rejects an empty array", () => {
  assert.throws(() => validateShares([]), InvalidSharesError);
});

test("validateShares rejects a total that is not 10_000", () => {
  assert.throws(() => validateShares([5_000, 3_000]), InvalidSharesError);
  assert.throws(
    () => validateShares([5_000, 3_000, 3_000]),
    InvalidSharesError
  );
});

test("validateShares rejects zero or negative shares", () => {
  assert.throws(() => validateShares([10_000, 0]), InvalidSharesError);
  assert.throws(() => validateShares([-1, 10_001]), InvalidSharesError);
});

test("validateShares rejects non-integer shares", () => {
  assert.throws(() => validateShares([5_000.5, 4_999.5]), InvalidSharesError);
});

test("sharesFromWeights splits equal weights evenly", () => {
  const shares = sharesFromWeights([1, 1, 1, 1]);
  assert.deepEqual(shares, [2_500, 2_500, 2_500, 2_500]);
  assert.doesNotThrow(() => validateShares(shares));
});

test("sharesFromWeights converts percentages directly", () => {
  const shares = sharesFromWeights([50, 30, 20]);
  assert.deepEqual(shares, [5_000, 3_000, 2_000]);
});

test("sharesFromWeights distributes rounding remainder without losing basis points", () => {
  const shares = sharesFromWeights([1, 1, 1]);
  assert.equal(shares.reduce((a, b) => a + b, 0), TOTAL_BASIS_POINTS);
  assert.doesNotThrow(() => validateShares(shares));
});

test("sharesFromWeights rejects a weight that rounds down to zero", () => {
  assert.throws(
    () => sharesFromWeights([100_000, 1]),
    InvalidSharesError
  );
});

test("sharesFromWeights rejects non-positive weights", () => {
  assert.throws(() => sharesFromWeights([50, 0, 50]), InvalidSharesError);
  assert.throws(() => sharesFromWeights([50, -10, 60]), InvalidSharesError);
});