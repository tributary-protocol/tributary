/**
 * Helpers for building and validating the `shares` array expected by
 * `create_split` / `update_split`. Shares are basis points and must
 * sum to exactly 10_000 (see the contract's `BadShareTotal` error).
 */

/**
 * Total number of basis points a valid `shares` array must sum to.
 * 10_000 basis points represents 100% of a split.
 */
export const TOTAL_BASIS_POINTS = 10_000;

/**
 * Thrown when a `shares` or `weights` array passed to one of the
 * helpers in this module is invalid (wrong length, non-positive
 * entries, or a total that doesn't add up to {@link TOTAL_BASIS_POINTS}).
 */
export class InvalidSharesError extends Error {
  /**
   * @param message - Human-readable explanation of what was invalid.
   */
  constructor(message: string) {
    super(message);
    this.name = "InvalidSharesError";
  }
}

/**
 * Validates that `shares` is a non-empty array of positive integers
 * summing to exactly {@link TOTAL_BASIS_POINTS}.
 *
 * Use this before calling `create_split` / `update_split` to catch a
 * malformed shares array locally instead of round-tripping to the
 * contract and getting back `BadShareTotal`.
 *
 * @param shares - Basis-point allocations, one per recipient.
 * @throws {InvalidSharesError} If `shares` is empty, contains a
 *   non-integer or non-positive value, or does not sum to
 *   {@link TOTAL_BASIS_POINTS}.
 *
 * @example
 * ```ts
 * validateShares([5_000, 3_000, 2_000]); // ok, sums to 10_000
 * validateShares([5_000, 3_000]); // throws InvalidSharesError
 * ```
 */
export function validateShares(shares: ReadonlyArray<number>): void {
  if (!Array.isArray(shares) || shares.length === 0) {
    throw new InvalidSharesError("shares must be a non-empty array");
  }

  let total = 0;
  for (const share of shares) {
    if (!Number.isInteger(share) || share <= 0) {
      throw new InvalidSharesError(
        `each share must be a positive integer, got ${share}`
      );
    }
    total += share;
  }

  if (total !== TOTAL_BASIS_POINTS) {
    throw new InvalidSharesError(
      `shares must sum to ${TOTAL_BASIS_POINTS} basis points, got ${total}`
    );
  }
}

/**
 * Builds a valid `shares` array from arbitrary positive weights
 * (e.g. percentages like `[50, 30, 20]`, or ratios like `[2, 1, 1]`).
 *
 * Each weight is scaled to basis points and rounded down; the
 * rounding remainder is then handed out, one basis point at a time,
 * to the entries with the largest fractional remainder — so the
 * result always sums to exactly {@link TOTAL_BASIS_POINTS} with no
 * basis points lost or duplicated.
 *
 * @param weights - Positive, arbitrary-scale weights (percentages,
 *   ratios, etc). Do not need to sum to any particular value.
 * @returns A `shares` array, the same length as `weights`, that sums
 *   to exactly {@link TOTAL_BASIS_POINTS} and is already valid per
 *   {@link validateShares}.
 * @throws {InvalidSharesError} If `weights` is empty, contains a
 *   non-positive or non-finite value, or if a weight is small enough
 *   relative to the others that it would round down to a zero share.
 *
 * @example
 * ```ts
 * sharesFromWeights([50, 30, 20]); // [5_000, 3_000, 2_000]
 * sharesFromWeights([1, 1, 1]);    // [3_334, 3_333, 3_333]
 * ```
 */
export function sharesFromWeights(weights: ReadonlyArray<number>): number[] {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new InvalidSharesError("weights must be a non-empty array");
  }

  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new InvalidSharesError(
        `each weight must be a positive number, got ${weight}`
      );
    }
  }

  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  const raw = weights.map((w) => (w / weightTotal) * TOTAL_BASIS_POINTS);
  const shares = raw.map(Math.floor);

  let remainder =
    TOTAL_BASIS_POINTS - shares.reduce((sum, s) => sum + s, 0);

  const byFractionDesc = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remainder > 0) {
    shares[byFractionDesc[cursor % byFractionDesc.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  // Weights that round to 0 basis points would silently create a
  // zero share, which the contract rejects. Fail early with a
  // clearer message instead.
  if (shares.some((s) => s === 0)) {
    throw new InvalidSharesError(
      "one or more weights are too small relative to the others and round down to a zero share"
    );
  }

  validateShares(shares);
  return shares;
}