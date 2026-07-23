//! Pure mirrors of the contract's two money-moving loops.
//!
//! [`amounts`] mirrors `Splitter::amounts` and [`payout`] mirrors
//! `Splitter::payout`, with the Soroban host stripped out: no storage, no
//! token client, no events. Everything the host would do is reduced to
//! bookkeeping, which is what the conservation invariants are about.
//!
//! Keeping these in step with `contracts/splitter/src/lib.rs` is a review
//! obligation, not a machine-checked one — see the residual-gap section of
//! `docs/formal-verification.md`.

use crate::split_part;

/// Reason a model run bailed out, mirroring `Error::ArithmeticOverflow`.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct Overflow;

/// Mirror of the contract's `amounts()`: every recipient but the last gets
/// `floor(amount * share / TOTAL_SHARES)`, and the last one gets the dust.
///
/// Writes `shares.len()` parts into `out` and returns the slice of them.
///
/// # Panics
/// If `out` is shorter than `shares`, or `shares` is empty — both impossible
/// in the contract, where `validate` has already run.
pub fn amounts<'a>(
    shares: &[u32],
    amount: i128,
    out: &'a mut [i128],
) -> Result<&'a [i128], Overflow> {
    let n = shares.len();
    assert!(n > 0 && out.len() >= n);
    let last = n - 1;
    let mut assigned: i128 = 0;
    for i in 0..n {
        let part = if i == last {
            dust(amount, assigned, shares[last])?
        } else {
            split_part(amount, shares[i]).ok_or(Overflow)?
        };
        out[i] = part;
        assigned += part;
    }
    Ok(&out[..n])
}

/// The last recipient's part: everything the rounding-down left over.
#[cfg(not(feature = "mutant-fixed-dust"))]
fn dust(amount: i128, assigned: i128, _last_share: u32) -> Result<i128, Overflow> {
    Ok(amount - assigned)
}

/// Mutant: pay the last recipient its share like everyone else, dropping the
/// dust on the floor.
#[cfg(feature = "mutant-fixed-dust")]
fn dust(amount: i128, _assigned: i128, last_share: u32) -> Result<i128, Overflow> {
    split_part(amount, last_share).ok_or(Overflow)
}

/// What a `payout` moved, in three buckets.
#[derive(Copy, Clone, Debug, Default, Eq, PartialEq)]
pub struct Ledger {
    /// Total the source address was debited by.
    pub debited: i128,
    /// Total transferred out to recipient accounts.
    pub credited_accounts: i128,
    /// Total credited to nested splits' escrow balances.
    pub credited_splits: i128,
}

/// Mirror of the contract's `payout()`.
///
/// `is_nested[i]` marks recipient `i` as a `Recipient::Split` rather than a
/// `Recipient::Account`. `from_is_vault` is the `distribute` case, where funds
/// already sit in the contract: crediting a nested split then moves no tokens,
/// it only rewrites the escrow ledger.
///
/// Parts that are not strictly positive are skipped, exactly as the contract
/// does.
///
/// # Panics
/// If `shares` and `is_nested` disagree in length, or `shares` is empty.
pub fn payout(
    shares: &[u32],
    is_nested: &[bool],
    amount: i128,
    from_is_vault: bool,
    scratch: &mut [i128],
) -> Result<Ledger, Overflow> {
    assert!(shares.len() == is_nested.len());
    let parts = amounts(shares, amount, scratch)?;
    let mut ledger = Ledger::default();
    // Indexed rather than iterated: walking the slice pulls CBMC's pointer
    // reasoning into every proof that goes through here, at a cost measured in
    // minutes. See `check_conservation` in `proofs.rs` for the same note.
    for i in 0..shares.len() {
        let part = parts[i];
        if part <= 0 {
            continue;
        }
        if is_nested[i] {
            ledger.credited_splits += part;
            if !from_is_vault {
                ledger.debited += part;
            }
        } else {
            ledger.credited_accounts += part;
            ledger.debited += part;
        }
    }
    Ok(ledger)
}
