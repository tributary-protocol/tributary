/**
 * Helpers for building and validating the `shares` array expected by
 * `create_split` / `update_split`. Shares are basis points and must
 * sum to exactly 10_000 (see the contract's `BadShareTotal` error).
 */

export const TOTAL_BASIS_POINTS = 10_000;

export class InvalidSharesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSharesError";
  }
}

/**
 * Validates that `shares` is a non-empty array of positive integers
 * summing to exactly `TOTAL_BASIS_POINTS`. Throws `InvalidSharesError`
 * with a specific message on the first problem found.
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
 * (e.g. percentages like [50, 30, 20], or ratios like [2, 1, 1]).
 * Rounds down and hands out the remainder, one basis point at a
 * time, to the entries with the largest fractional remainder so the
 * result always sums to exactly `TOTAL_BASIS_POINTS`.
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