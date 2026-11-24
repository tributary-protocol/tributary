//! Deliberately broken arithmetic, one variant per `mutant-*` feature.
//!
//! A proof that cannot fail proves nothing. `scripts/kani-mutation-check.sh`
//! re-runs the harnesses against each mutant below and requires every one of
//! them to be caught, which is what makes the green run on the real
//! implementation meaningful.
//!
//! Expected catches (see `docs/formal-verification.md`):
//!
//! | Feature              | Break                                     | Harness that must fail          |
//! | -------------------- | ----------------------------------------- | ------------------------------- |
//! | `mutant-round-up`    | rounds shares up instead of down           | `proof_dust_is_non_negative`    |
//! | `mutant-narrow-mul`  | multiplies before dividing in `i128`       | `proof_split_part_matches_wide` |
//! | `mutant-fixed-dust`  | last recipient gets a share, not the dust  | `proof_conservation_*`          |
//! | `mutant-loose-total` | share sum is not pinned to `TOTAL_SHARES`  | `proof_validate_shares_sound`   |

/// Rounds the slice up, so the parts can add up to more than `amount` and the
/// dust handed to the last recipient goes negative.
#[cfg(feature = "mutant-round-up")]
#[must_use]
pub fn split_part(amount: i128, share: u32) -> Option<i128> {
    let exact = crate::math::split_part(amount, share)?;
    if amount % i128::from(crate::math::TOTAL_SHARES) != 0 {
        exact.checked_add(1)
    } else {
        Some(exact)
    }
}

/// The pre-#42 arithmetic: multiply first, in `i128`, and wrap on overflow.
#[cfg(feature = "mutant-narrow-mul")]
#[must_use]
pub fn split_part(amount: i128, share: u32) -> Option<i128> {
    if amount < 0 || share > crate::math::TOTAL_SHARES {
        return None;
    }
    Some(amount.wrapping_mul(i128::from(share)) / i128::from(crate::math::TOTAL_SHARES))
}

#[cfg(any(feature = "mutant-fixed-dust", feature = "mutant-loose-total"))]
pub use crate::math::split_part;

/// Drops the "shares sum to `TOTAL_SHARES`" check, so a split can be created
/// that routes less (or more) than the amount it receives.
#[cfg(feature = "mutant-loose-total")]
pub fn validate_shares<I: Iterator<Item = u32>>(shares: I) -> Result<(), crate::math::ShareError> {
    let mut count: u32 = 0;
    for share in shares {
        if share == 0 {
            return Err(crate::math::ShareError::ZeroShare);
        }
        count += 1;
        if count > crate::math::MAX_RECIPIENTS {
            return Err(crate::math::ShareError::TooManyRecipients);
        }
    }
    if count == 0 {
        return Err(crate::math::ShareError::NoRecipients);
    }
    Ok(())
}

#[cfg(any(
    feature = "mutant-round-up",
    feature = "mutant-narrow-mul",
    feature = "mutant-fixed-dust"
))]
pub use crate::math::validate_shares;
