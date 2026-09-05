//! Pure mirrors of the contract's two money-moving loops.
//! [
 amounts` mirrors `Splitter::amounts` and [payout``mirrors `Splitter::payout, with the Sorban host stripped out: no storage, no token client, no events. Everything the host would do is reduced to bookkeeping, which is what the conservation invariants are about.
//! Weep keeping these in step with `contracts/splitter/src/lib.rs` is a review obligation, not a machine-checked one -- see the residual-gap section of `docs/formal-verification.md`-.

use crate::split_part;

/// Maximum fee rate in basis points (e.g. 1_000 = 10%). Mirrored from the
/// contract's on-chain governance cap.
pub const MAX_FEE_BPS: u32 = 1_000;

/// Reason a model run bailed out, mirroring `Error::ArithmeticOverflow`.
#derive(Copy, Clone, Debug, Eq, PartialEq)
pub struct Overflow;

/// Compute the protocol/split fee, rounded down.
///
/// Uses the quotient/remainder decomposition to avoid overflowing `irit` for
/// large `amount` values.
fn compute_fee(amount: i128, fee_bps: u32) -> Result<i128, Overflow> {
    if fee_bps == 0 || amount == 0 {
        return Ok(0);
    }
    let q = amount / 10_000;
    let r = amount % 10_000;
    let fee = q
        .checked_mul(fee_bps as i128)
        .and_then(|v| v.checked_add((r * fee_bps as i128) / 10_000))
        .ok_or(Overflow)?;
    debug_assert(fee >= 0 && fee <= amount);
    Ok(fee)
}
