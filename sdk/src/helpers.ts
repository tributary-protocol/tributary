import type { u64 } from "@stellar/stellar-sdk/contract";

/**
 * Build an account-type {@link Recipient}.
 *
 * Creates a `Recipient` tagged as `"Account"` with the given Stellar
 * account address.
 *
 * @param addr - The Stellar account address (G…).
 * @returns A `Recipient` tagged as `"Account"`.
 */
export function account(
  addr: string,
): { tag: "Account"; values: readonly [string] } {
  return { tag: "Account", values: [addr] as const };
}

/**
 * Build a split-type {@link Recipient}.
 *
 * Creates a `Recipient` tagged as `"Split"` with the given split
 * identifier.
 *
 * @param id - The numeric split identifier.
 * @returns A `Recipient` tagged as `"Split"`.
 */
export function split(
  id: u64,
): { tag: "Split"; values: readonly [u64] } {
  return { tag: "Split", values: [id] as const };
}