//! Pure share arithmetic — the money-safety core of the contract.
//!
//! Everything in this module is `no_std`, allocation-free, and free of any
//! Soroban type, so it can be driven with symbolic inputs by a model checker.
//! [`crate::amounts`] and [`crate::validate`] are thin wrappers over the two
//! entry points here, so what is proven about this file is proven about the
//! contract.
//!
//! The same file is compiled a second time, verbatim, by the
//! `tributary-splitter-proofs` crate (via `#[path]`), which carries the Kani
//! harnesses. See `docs/formal-verification.md` for what is proven and under
//! which bounds.

/// Shares are basis points: every split's shares sum to exactly this.
pub const TOTAL_SHARES: u32 = 10_000;

/// Upper bound on recipients per split.
pub const MAX_RECIPIENTS: u32 = 32;

/// Why a share vector is not a valid split. Mapped 1:1 onto the contract's
/// public error codes by [`crate::validate`].
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ShareError {
    /// The share vector is empty.
    NoRecipients,
    /// More than [`MAX_RECIPIENTS`] shares.
    TooManyRecipients,
    /// Some share is `0`.
    ZeroShare,
    /// Shares do not sum to [`TOTAL_SHARES`], or the sum overflows `u32`.
    BadShareTotal,
}

/// One recipient's slice of `amount`: `floor(amount * share / TOTAL_SHARES)`.
///
/// Returns `None` outside the domain the contract permits — a negative
/// `amount`, or a `share` above [`TOTAL_SHARES`] (which `validate` forbids).
/// Inside that domain the result is always `Some`, and never overflows.
///
/// The naive `amount * share / TOTAL_SHARES` overflows `i128` for large
/// amounts before the division brings the value back into range (see #42).
/// Splitting `amount` into quotient and remainder against `TOTAL_SHARES`
/// first keeps every intermediate in `i128` while computing the exact same
/// floor:
///
/// ```text
/// amount = q * T + r,  0 <= r < T
/// amount * share / T = q * share + (r * share) / T
/// ```
///
/// `q * share <= q * T <= amount` fits by construction, and `r * share` is
/// under `T * T = 10^8`. No widening, no 256-bit intermediate, no panic.
///
/// This replaced an `I256` intermediate, which computes the same values but is
/// a host call the model checker cannot see inside. The exchange costs about
/// 1.3 KB of Wasm and buys machine-checked proofs of conservation; see
/// `docs/formal-verification.md`.
#[must_use]
pub fn split_part(amount: i128, share: u32) -> Option<i128> {
    if amount < 0 || share > TOTAL_SHARES {
        return None;
    }
    let total = TOTAL_SHARES as i128;
    let share = share as i128;
    let whole = amount / total;
    let rem = amount % total;
    // Both `checked_` calls are provably total on this domain (see the Kani
    // harness `proof_split_part_total`); they are kept so a future change to
    // the domain surfaces as a typed error instead of a panic.
    whole.checked_mul(share)?.checked_add(rem * share / total)
}

/// Checks a split's share vector: non-empty, at most [`MAX_RECIPIENTS`]
/// entries, no zero share, summing to exactly [`TOTAL_SHARES`].
///
/// Takes an iterator rather than a slice so the contract can pass a Soroban
/// `Vec<u32>` without allocating.
pub fn validate_shares<I: Iterator<Item = u32>>(shares: I) -> Result<(), ShareError> {
    let mut total: u32 = 0;
    let mut count: u32 = 0;
    for share in shares {
        if share == 0 {
            return Err(ShareError::ZeroShare);
        }
        count += 1;
        if count > MAX_RECIPIENTS {
            return Err(ShareError::TooManyRecipients);
        }
        total = total.checked_add(share).ok_or(ShareError::BadShareTotal)?;
    }
    if count == 0 {
        return Err(ShareError::NoRecipients);
    }
    if total != TOTAL_SHARES {
        return Err(ShareError::BadShareTotal);
    }
    Ok(())
}
