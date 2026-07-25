//! A 256-bit specification of "a share of an amount", written with no
//! division at all.
//!
//! The obvious way to check [`crate::math::split_part`] is to compare it
//! against a second, wider implementation. That costs the solver two extra
//! 128-bit division circuits, and division is by far the most expensive thing
//! a bit-blasting model checker can be handed.
//!
//! So the harnesses state the *definition* of flooring division instead:
//!
//! ```text
//! part == floor(amount * share / TOTAL_SHARES)
//!   <=>  part * TOTAL_SHARES <= amount * share < (part + 1) * TOTAL_SHARES
//! ```
//!
//! Both products need more than 128 bits, so they are computed exactly as
//! [`Wide`] pairs — multiplication and subtraction only. Nothing here is
//! compiled into the contract; it exists purely to say what the contract's
//! arithmetic is supposed to mean.

use crate::math::TOTAL_SHARES;

/// An exact 256-bit unsigned value, as two `u128` limbs: `hi * 2^128 + lo`.
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub struct Wide {
    pub hi: u128,
    pub lo: u128,
}

impl Wide {
    /// Exact `a * b`, where `b` is small enough that no limb can overflow.
    ///
    /// Splitting `a` into 64-bit halves keeps each partial product under
    /// `2^64 * 2^32 = 2^96`:
    ///
    /// ```text
    /// a * b = (a_hi * 2^64 + a_lo) * b = (a_hi * b) * 2^64 + (a_lo * b)
    /// ```
    #[must_use]
    pub fn mul_small(a: u128, b: u32) -> Self {
        let b = u128::from(b);
        let upper = (a >> 64) * b; // < 2^96
        let lower = (a & u128::from(u64::MAX)) * b; // < 2^96

        // Renormalise `upper * 2^64 + lower` into base 2^128.
        let (lo, carry) = (upper << 64).overflowing_add(lower);
        Self {
            hi: (upper >> 64) + u128::from(carry),
            lo,
        }
    }

    /// Exact `self - other`. Returns `None` if it would go negative.
    #[must_use]
    pub fn checked_sub(self, other: Self) -> Option<Self> {
        if self < other {
            return None;
        }
        let (lo, borrow) = self.lo.overflowing_sub(other.lo);
        Some(Self {
            hi: self.hi - other.hi - u128::from(borrow),
            lo,
        })
    }

    /// Whether the value is below `TOTAL_SHARES`, i.e. is a valid remainder.
    #[must_use]
    pub fn is_valid_remainder(self) -> bool {
        self.hi == 0 && self.lo < u128::from(TOTAL_SHARES)
    }
}

#[cfg(test)]
mod tests {
    use super::Wide;

    #[test]
    fn mul_small_is_exact_below_128_bits() {
        for a in [
            0u128,
            1,
            7,
            9_999,
            1 << 63,
            (1 << 64) + 5,
            u128::from(u64::MAX),
        ] {
            for b in [1u32, 3, 10_000, u32::MAX] {
                let expected = Wide {
                    hi: 0,
                    lo: a * u128::from(b),
                };
                assert_eq!(Wide::mul_small(a, b), expected);
            }
        }
    }

    #[test]
    fn mul_small_carries_past_128_bits() {
        // (2^128 - 1) * 2 = 2^129 - 2 = hi 1, lo (2^128 - 2)
        assert_eq!(
            Wide::mul_small(u128::MAX, 2),
            Wide {
                hi: 1,
                lo: u128::MAX - 1
            }
        );
    }

    #[test]
    fn subtraction_borrows_across_the_limb() {
        let a = Wide { hi: 1, lo: 0 };
        let b = Wide { hi: 0, lo: 1 };
        assert_eq!(
            a.checked_sub(b),
            Some(Wide {
                hi: 0,
                lo: u128::MAX
            })
        );
        assert_eq!(b.checked_sub(a), None);
    }

    #[test]
    fn remainder_bound_matches_total_shares() {
        assert!(Wide { hi: 0, lo: 9_999 }.is_valid_remainder());
        assert!(!Wide { hi: 0, lo: 10_000 }.is_valid_remainder());
        assert!(!Wide { hi: 1, lo: 0 }.is_valid_remainder());
    }
}
