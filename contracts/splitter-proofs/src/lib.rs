//! Machine-checked proofs of the splitter's money-safety invariants (#352).
//!
//! The contract's central promise is that share math rounds down and hands the
//! dust to the last recipient, so **amount in always equals amount out**. This
//! crate proves that with [Kani](https://model-checking.github.io/kani/), a
//! bounded model checker: the invariants below hold for *every* input inside a
//! documented domain, not just the sampled ones a property test reaches.
//!
//! The arithmetic under proof is not a copy. `contracts/splitter/src/math.rs`
//! is compiled into this crate verbatim through `#[path]`, and the contract's
//! `amounts()` / `validate()` are thin wrappers over it, so a proof here is a
//! proof about the deployed code.
//!
//! What is *not* covered: the Soroban host itself (storage, token transfers,
//! auth) is outside the model. [`model`] mirrors the contract's `amounts` and
//! `payout` loops as pure functions; that mirroring is checked by review and by
//! the contract's own tests, and is the residual gap documented in
//! `docs/formal-verification.md`.
//!
//! Run the proofs with `just verify` (or `cargo kani -p tributary-splitter-proofs`).

// The single source of truth, shared with the contract crate.
#[path = "../../splitter/src/math.rs"]
pub mod math;

pub mod model;
pub mod reference;

#[cfg(any(
    feature = "mutant-round-up",
    feature = "mutant-narrow-mul",
    feature = "mutant-fixed-dust",
    feature = "mutant-loose-total"
))]
pub mod mutants;

/// The arithmetic the models call. Normally the contract's own; under a
/// `mutant-*` feature, a deliberately broken stand-in.
#[cfg(not(any(
    feature = "mutant-round-up",
    feature = "mutant-narrow-mul",
    feature = "mutant-fixed-dust",
    feature = "mutant-loose-total"
)))]
pub use math::{split_part, validate_shares};

#[cfg(any(
    feature = "mutant-round-up",
    feature = "mutant-narrow-mul",
    feature = "mutant-fixed-dust",
    feature = "mutant-loose-total"
))]
pub use mutants::{split_part, validate_shares};

#[cfg(kani)]
mod proofs;
