//! The Kani harnesses.
//!
//! Each `#[kani::proof]` is checked exhaustively over the symbolic domain it
//! declares, rather than over sampled values. The domains are not all the
//! same, and that is the whole design: bit-blasting `split_part` costs the
//! solver a 128-bit division feeding a 128-bit multiplier, and a symbolic
//! `amount` and a symbolic `share` cannot both be at full width in the same
//! query. So the harnesses come in tiers, each pinning one dimension and
//! quantifying over the other.
//!
//! | Prefix            | `amount`            | `share` vector        |
//! | ----------------- | ------------------- | --------------------- |
//! | `proof_shares_`   | not involved        | all valid vectors     |
//! | `proof_bounded_`  | all below `2^16`    | all valid vectors     |
//! | `proof_full_`     | all of `i128`       | fixed, representative |
//! | `proof_floor_`    | all below `2^16`    | fixed, representative |
//!
//! Bounds, measured runtimes, and the residual gap: `docs/formal-verification.md`.

use crate::math::{ShareError, MAX_RECIPIENTS, TOTAL_SHARES};
use crate::model;
use crate::reference::Wide;
use crate::{split_part, validate_shares};

/// A symbolic amount the contract would accept, below `2^16`. Written as a
/// widened `u16` rather than an assumed-range `i128` so the high bits are
/// structurally zero and the solver never builds the wide circuit at all.
///
/// The ceiling is above `TOTAL_SHARES`, so `amount / TOTAL_SHARES` is non-zero
/// and the rounding has something to round — a tighter bound would make these
/// harnesses vacuous rather than merely narrow.
fn any_bounded_amount() -> i128 {
    let amount = i128::from(kani::any::<u16>());
    kani::assume(amount > 0);
    amount
}

/// A symbolic amount anywhere in the range the contract accepts.
fn any_amount() -> i128 {
    let amount: i128 = kani::any();
    kani::assume(amount > 0);
    amount
}

/// A symbolic share vector that `validate` would accept.
fn any_valid_shares<const N: usize>() -> [u32; N] {
    let shares: [u32; N] = kani::any();
    kani::assume(validate_shares(shares.iter().copied()).is_ok());
    shares
}

/// Conservation and dust correctness over one `(shares, amount)` pair: the
/// parts sum to exactly the amount, the last recipient's part is exactly what
/// the others left behind, that remainder is never negative, and — through
/// Kani's arithmetic checks — nothing along the way overflows.
///
/// Deliberately lean. Adding "and every individual part is non-negative" here
/// makes the solver pin down the exact output of the share multiplier for each
/// recipient at once, which does not terminate at full `i128` width. That
/// property is proven separately and cheaply, one share at a time, by
/// [`check_part_bounds`] and `proof_bounded_split_part_total`.
fn check_conservation<const N: usize>(shares: &[u32; N], amount: i128) {
    let mut buf = [0i128; N];
    let parts = model::amounts(shares, amount, &mut buf).expect("no overflow in the domain");

    // Indexed rather than `for &part in &parts[..N - 1]`: iterating a
    // sub-slice drags CBMC's pointer reasoning into the query and turns a
    // 19-second proof into one that does not finish in four minutes.
    let mut others: i128 = 0;
    #[allow(clippy::needless_range_loop)]
    for i in 0..N - 1 {
        others += parts[i];
    }
    let dust = parts[N - 1];
    assert_eq!(others + dust, amount, "amount in must equal amount out");
    assert_eq!(dust, amount - others, "the last recipient takes the dust");
    assert!(dust >= 0, "the dust is never negative");
}

/// A recipient's slice is a slice: non-negative, and never more than the whole.
/// Together with conservation this rules out one recipient being paid out of
/// another's share.
fn check_part_bounds(share: u32, amount: i128) {
    let part = split_part(amount, share).expect("total on the admitted domain");
    assert!(
        part >= 0,
        "a slice of a non-negative amount is non-negative"
    );
    assert!(part <= amount, "no recipient is paid more than the input");
}

// ---------------------------------------------------------------------------
// proof_shares_: share validation, and the edges of the arithmetic's domain.
// No amounts involved, so these are sub-second.
// ---------------------------------------------------------------------------

/// Validation soundness: anything `validate_shares` accepts really does sum to
/// `TOTAL_SHARES`, has no zero share, and fits the recipient bound. Every
/// other harness assumes this of its share vectors, so it has to be earned.
fn validate_sound<const N: usize>() {
    let shares: [u32; N] = kani::any();
    kani::assume(validate_shares(shares.iter().copied()).is_ok());

    let mut sum: u64 = 0;
    for &share in &shares {
        assert!(share > 0, "no accepted split has a zero share");
        sum += u64::from(share);
    }
    assert_eq!(sum, u64::from(TOTAL_SHARES), "accepted shares are complete");
    assert!(N as u32 <= MAX_RECIPIENTS, "within the recipient bound");
}

#[kani::proof]
fn proof_shares_sound_n2() {
    validate_sound::<2>();
}

#[kani::proof]
fn proof_shares_sound_n3() {
    validate_sound::<3>();
}

#[kani::proof]
fn proof_shares_sound_n4() {
    validate_sound::<4>();
}

/// The other side of validation: an empty vector is rejected as empty, and one
/// past `MAX_RECIPIENTS` is rejected as too long whatever it contains.
/// Together with soundness this pins the accepted set from both directions.
#[kani::proof]
fn proof_shares_rejects_bad_lengths() {
    let empty: [u32; 0] = [];
    assert_eq!(
        validate_shares(empty.iter().copied()),
        Err(ShareError::NoRecipients)
    );

    // The filler is a share a split could actually carry. Left fully
    // symbolic, a `u32::MAX`-sized entry overflows the running sum before the
    // 33rd element is reached and the answer is `BadShareTotal` instead — a
    // distinction the contract never sees, because `validate` rejects on
    // `recipients.len()` before it ever looks at the shares.
    let mut oversized = [1u32; MAX_RECIPIENTS as usize + 1];
    let filler: u32 = kani::any();
    kani::assume(filler > 0 && filler <= TOTAL_SHARES);
    oversized[0] = filler;
    assert_eq!(
        validate_shares(oversized.iter().copied()),
        Err(ShareError::TooManyRecipients)
    );
}

/// Outside the domain the contract permits, `split_part` reports rather than
/// wraps: `amounts()` turns the `None` into `Error::ArithmeticOverflow` instead
/// of panicking or paying out a wrapped value.
#[kani::proof]
fn proof_shares_split_part_rejects_out_of_domain() {
    let amount: i128 = kani::any();
    let share: u32 = kani::any();
    kani::assume(amount < 0 || share > TOTAL_SHARES);

    assert!(split_part(amount, share).is_none());
}

// ---------------------------------------------------------------------------
// proof_bounded_: every valid share vector, amounts below 2^16.
// ---------------------------------------------------------------------------

/// `split_part` is total on the contract's domain — never `None`, never a
/// panic, never an overflow — and its result is a slice of the amount, for
/// *every* share a valid split can carry.
#[kani::proof]
fn proof_bounded_split_part_total() {
    let share: u32 = kani::any();
    kani::assume(share <= TOTAL_SHARES);
    check_part_bounds(share, any_bounded_amount());
}

/// The single-recipient case: that recipient is all dust, and must receive the
/// entire amount.

#[kani::proof]
fn proof_bounded_conservation_n1() {
    let shares = any_valid_shares::<1>();
    check_conservation(&shares, any_bounded_amount());
}

/// Conservation and dust correctness against *every* share layout two
/// recipients can have — including the adversarial ones, `[1, 9_999]` and
/// `[9_999, 1]` — for every amount below `2^16`.
///
/// The tier stops at two recipients: a third symbolic share adds a second
/// symbolic multiplier to the query and it stops terminating. Wider splits are
/// proven over the entire `i128` amount range at fixed share vectors instead.
#[kani::proof]
fn proof_bounded_conservation_n2() {
    let shares = any_valid_shares::<2>();
    check_conservation(&shares, any_bounded_amount());
}

/// No value creation in a payout: everything credited — to recipient accounts
/// and to nested splits' escrow balances — adds up to the amount that went in,
/// and the source is debited by exactly what actually moved. Covers both `pay`
/// (funds arrive from the payer) and `distribute` (funds already sit in the
/// vault, so crediting a child moves no tokens at all), against every
/// two-recipient share layout.
#[kani::proof]
fn proof_bounded_payout_no_value_creation_n2() {
    let shares = any_valid_shares::<2>();
    let amount = any_bounded_amount();
    let is_nested: [bool; 2] = kani::any();
    let from_is_vault: bool = kani::any();

    let mut buf = [0i128; 2];
    let ledger = model::payout(&shares, &is_nested, amount, from_is_vault, &mut buf)
        .expect("no overflow in the domain");

    assert_eq!(
        ledger.credited_accounts + ledger.credited_splits,
        amount,
        "every unit paid in lands in exactly one recipient bucket"
    );
    let moved = if from_is_vault {
        ledger.credited_accounts
    } else {
        ledger.credited_accounts + ledger.credited_splits
    };
    assert_eq!(ledger.debited, moved, "the source funds exactly what moves");
}

// ---------------------------------------------------------------------------
// proof_full_: every i128 amount, at fixed share vectors.
//
// This is the tier that closes the overflow class from #42: a high-supply
// token can be paid an amount where `amount * share` does not fit an i128.
//
// The vectors are fixed because a symbolic share and a full-width amount
// cannot share a query, and they are *these* vectors because solve time turns
// out to depend sharply on the share values themselves — the multiplier for
// `9_999` does not simplify the way the one for `5_000` does, and a vector
// containing it does not finish in ten minutes. Extreme layouts like
// `[9_999, 1]` are covered instead by `proof_bounded_conservation_n2`, which
// quantifies over every two-recipient vector at amounts below `2^16`.
// ---------------------------------------------------------------------------

#[kani::proof]
fn proof_full_conservation_single() {
    check_conservation(&[TOTAL_SHARES], any_amount());
}

#[kani::proof]
fn proof_full_conservation_even() {
    check_conservation(&[5_000, 5_000], any_amount());
}

#[kani::proof]
fn proof_full_conservation_thirds() {
    check_conservation(&[3_333, 3_333, 3_334], any_amount());
}

#[kani::proof]
fn proof_full_conservation_mixed() {
    check_conservation(&[2_000, 3_000, 5_000], any_amount());
}

#[kani::proof]
fn proof_full_conservation_quarters() {
    check_conservation(&[2_500, 2_500, 2_500, 2_500], any_amount());
}

/// Part bounds over the whole `i128` range, at the shares where the
/// multiply-before-divide of #42 would have overflowed hardest.
///
/// Not at `share == TOTAL_SHARES`: there `part <= amount` becomes an equality
/// the solver has to push back through the division, and the query does not
/// finish in 25 minutes. That case is covered at bounded amounts by
/// `proof_bounded_split_part_total`, which quantifies over every share.
#[kani::proof]
fn proof_full_part_bounds_share_3333() {
    check_part_bounds(3_333, any_amount());
}

#[kani::proof]
fn proof_full_part_bounds_share_1() {
    check_part_bounds(1, any_amount());
}

#[kani::proof]
fn proof_full_part_bounds_share_5000() {
    check_part_bounds(5_000, any_amount());
}

// ---------------------------------------------------------------------------
// proof_floor_: rounding is exactly floor.
//
// Conservation alone does not pin the rounding down — arithmetic that paid
// every recipient zero and handed the whole amount to the last one would
// conserve value perfectly. These harnesses state the definition of flooring
// division through an exact 256-bit product, with no division in the
// specification itself:
//
//     part == floor(amount * share / T)
//       <=>  part * T <= amount * share < (part + 1) * T
// ---------------------------------------------------------------------------

fn check_is_floor(share: u32) {
    let amount = any_bounded_amount();
    let part = split_part(amount, share).expect("total on the admitted domain");

    let exact = Wide::mul_small(amount as u128, share);
    let taken = Wide::mul_small(part as u128, TOTAL_SHARES);
    let remainder = exact
        .checked_sub(taken)
        .expect("rounding down never pays out more than the exact share");
    assert!(
        remainder.is_valid_remainder(),
        "and never withholds a whole unit of share"
    );
}

#[kani::proof]
fn proof_floor_share_3333() {
    check_is_floor(3_333);
}

#[kani::proof]
fn proof_floor_share_1() {
    check_is_floor(1);
}

#[kani::proof]
fn proof_floor_share_total() {
    check_is_floor(TOTAL_SHARES);
}
