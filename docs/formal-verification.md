# Formal verification

The contract's module doc makes one central promise:

> Share math rounds down and hands the dust to the last recipient, so amount in
> always equals amount out.

Unit tests and the property test in `contracts/splitter/src/test.rs` sample that
claim. They cannot show the absence of an adversarial input that breaks it, and
for a fund-splitting contract a single rounding or overflow edge that creates or
destroys value is a direct loss.

This page describes the machine-checked half of the answer: what is proven with
[Kani](https://model-checking.github.io/kani/), a bounded model checker for
Rust, under exactly which bounds, and what is left covered only by tests.

## What is under proof

The money math was extracted into `contracts/splitter/src/math.rs`: two pure,
`no_std`, allocation-free functions with no Soroban types in sight.

| Function          | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `split_part`      | one recipient's slice, `floor(amount * share / 10_000)`        |
| `validate_shares` | the share-vector half of `validate`                            |

The contract calls these directly — `amounts()` is a loop around `split_part`
plus the dust step, and `validate()` maps `ShareError` onto its own error codes.
The proofs crate (`contracts/splitter-proofs`) compiles *the same file*, not a
copy, via `#[path]`. What is proven there is proven about the deployed
arithmetic.

Extracting them changed the contract, not just its packaging. `amounts()`
previously computed `amount * share` in Soroban's 256-bit `I256` to keep the
intermediate from overflowing (#42); `split_part` gets the same exact result by
splitting `amount` into quotient and remainder against `TOTAL_SHARES` first, so
every intermediate fits an `i128`. That was necessary rather than cosmetic — a
model checker cannot reason about `I256`, which is a host function call, so the
old formulation could not be proven at all. It costs about 1.3 KB of Wasm
(42 777 → 44 075 bytes), because 128-bit division is emitted as guest code
where `I256` was a host call. Nothing else about the contract's behaviour
changes, and the existing test suite passes unmodified.

Two things in the proofs crate are not contract code:

- `model.rs` mirrors the contract's `amounts()` and `payout()` loops with the
  host stripped out (no storage, no token client, no events). Payment becomes
  bookkeeping, which is what conservation is about.
- `reference.rs` is a 256-bit specification of "a share of an amount", used to
  state exactness without any division.

## The invariants

| # | Invariant | Harnesses |
| - | --------- | --------- |
| 1 | **Conservation.** The parts a payment is broken into sum to exactly the amount paid in, and computing them never overflows. | `proof_bounded_conservation_n1`, `proof_bounded_conservation_n2`, `proof_full_conservation_*` |
| 2 | **Dust correctness.** The last recipient receives exactly `amount - sum(others)`, and it is never negative. | same harnesses — `check_conservation` asserts both |
| 3 | **No value creation in payout.** Everything credited — to recipient accounts and to nested splits' escrow balances — adds up to the amount that went in, and the source is debited by exactly what actually moved. | `proof_bounded_payout_no_value_creation_n2` |
| 4 | **Rounding is exactly floor.** `split_part` computes `floor(amount * share / 10_000)`: no wrap, no truncation toward zero, no off-by-one. | `proof_floor_share_*` |
| 5 | **Validation soundness.** Anything `validate_shares` accepts really does sum to `TOTAL_SHARES`, has no zero share, and fits `MAX_RECIPIENTS`. | `proof_shares_sound_n*`, `proof_shares_rejects_bad_lengths` |
| 6 | **A part is a slice.** Every recipient's part is non-negative and no larger than the whole amount, so nobody is paid out of anybody else's share. | `proof_bounded_split_part_total`, `proof_full_part_bounds_share_*` |
| 7 | **Totality of the arithmetic.** On the domain the contract admits, `split_part` never returns `None` and never panics; outside it, it reports rather than wraps. | `proof_bounded_split_part_total`, `proof_shares_split_part_rejects_out_of_domain` |

Invariant 5 is what every other harness assumes about its share vectors, so it
is proven rather than assumed.

## The bounds, and why they are where they are

Kani bit-blasts the program into SAT. Two things dominate the cost, and they
compound:

- **`amount` width.** Every symbolic bit of a 128-bit operand feeds a division
  circuit inside `split_part`.
- **Symbolic `share`.** `(amount / 10_000) * share` becomes a symbolic
  128×128 multiplier. Deciding properties of a multiplier is the classic hard
  SAT instance, and the divisor result feeding it carries no static range
  information the solver can exploit.

Either dimension alone is tractable. Both at full width together is not — it was
measured at over 30 minutes with no answer, on several solvers. So the proofs
are split into tiers that each fix one dimension and quantify over the other,
and between them they cover both failure classes:

| Tier | `amount` | `share` vector | Recipients | What it buys |
| ---- | -------- | -------------- | ---------- | ------------ |
| `proof_shares_*` | — | **all** valid vectors | 2–4, plus the 0 and 33 boundaries | Validation soundness |
| `proof_bounded_*` | all of `0 < amount < 2^16` | **all** valid vectors | 1–2 | Conservation, dust and payout accounting against every share layout, including the adversarial ones (`[1, 9_999]`, `[9_999, 1]`) |
| `proof_full_*` | **all** of `0 < amount <= i128::MAX` | fixed | 1–4 | The overflow class (#42): no `i128` amount, however large, breaks conservation |
| `proof_floor_*` | all of `0 <= amount < 2^16` | fixed | n/a | Rounding is exactly floor, not merely self-consistent |

Two of those bounds are tighter than they look like they should be, and both
were set by measurement rather than by taste:

- **The symbolic-share tier stops at two recipients.** A third symbolic share
  puts a second symbolic multiplier in the query and it stops terminating; at
  two it lands in 10 s.
- **The full-range tier uses `[10_000]`, `[5_000, 5_000]`,
  `[3_333, 3_333, 3_334]`, `[2_000, 3_000, 5_000]` and `[2_500; 4]`.** Solve
  time depends sharply on the share *values*, and not in a way that is easy to
  predict from the outside: `[9_999, 1]` did not finish in ten minutes where
  `[5_000, 5_000]` takes thirteen seconds, and asserting `part <= amount` at
  `share == 10_000` — where that bound is tight — did not finish in
  twenty-five. Those cases are covered instead by the bounded tier, which
  quantifies over *every* share at amounts below `2^16`. The two tiers are
  complementary by construction, and every runtime in the table below was
  measured rather than estimated, because estimating them turned out to be
  exactly the thing that does not work here.

## Runtimes

Measured on 4 cores (the size of a GitHub-hosted runner), Kani 0.67, CBMC's
default CaDiCaL backend. Solve time, excluding the one-off Kani install.

| Harness | Solve time |
| ------- | ---------- |
| `proof_shares_sound_n2` / `_n3` / `_n4` | 1–2 s each |
| `proof_shares_rejects_bad_lengths` | 25 s |
| `proof_shares_split_part_rejects_out_of_domain` | 5 s |
| `proof_bounded_split_part_total` | 7 s |
| `proof_bounded_conservation_n1` | 3 s |
| `proof_bounded_conservation_n2` | 10 s |
| `proof_bounded_payout_no_value_creation_n2` | 13 s |
| `proof_full_conservation_single` | 3 s |
| `proof_full_conservation_even` | 13 s |
| `proof_full_conservation_thirds` | 32 s |
| `proof_full_conservation_mixed` | 68 s |
| `proof_full_conservation_quarters` | 180 s |
| `proof_full_part_bounds_share_1` / `_3333` / `_5000` | 1–3 s each |
| `proof_floor_share_1` | 1 s |
| `proof_floor_share_3333` / `_total` | ~28 s each |

Fast tier (`proof_shares_` + `proof_bounded_`): **~1 min**. Full tier
(`proof_full_` + `proof_floor_`): **~6 min**. Add roughly a minute of build on
top of either, and about ten minutes for the one-off Kani install.

CI budget (`.github/workflows/kani.yml`):

- **On pull requests touching `contracts/`**: `proof_shares_*` and
  `proof_bounded_*`, capped at 20 minutes.
- **Nightly and on demand**: everything, plus the mutation check, capped at 45
  minutes.

The caps sit close to the measured times on purpose. A change that makes a proof
intractable should fail loudly rather than quietly grow the bill.

## Why the proofs are believed to be meaningful

A proof that cannot fail proves nothing. `scripts/kani-mutation-check.sh`
(`just verify-mutants`) breaks the arithmetic on purpose, one mutant per run,
and requires the proofs to catch every one:

| Mutant | Break | Must be caught by |
| ------ | ----- | ----------------- |
| `mutant-round-up` | rounds shares up instead of down | `proof_bounded_split_part_total` |
| `mutant-narrow-mul` | multiplies before dividing in `i128` — the pre-#42 arithmetic | `proof_full_part_bounds_share_3333` |
| `mutant-fixed-dust` | pays the last recipient a share and drops the dust | `proof_full_conservation_thirds` |
| `mutant-loose-total` | stops pinning the share sum to `TOTAL_SHARES` | `proof_shares_sound_n3` |

The check fails if any mutant survives. It also has to be kept honest in the
other direction: `mutant-narrow-mul` initially *survived*, because wrapping only
changes the answer for amounts above `2^113` and the harness it was paired with
is bounded at `2^16`. The pairing, not the mutant, was wrong — it now runs
against the full-range harness, where it fails in one second.

## Residual gap

What the proofs do **not** cover, and what covers it instead:

1. **Recipient counts above 4.** Splits allow up to `MAX_RECIPIENTS` (32).
   Solve time grows with each additional division and multiplier, so the
   harnesses are instantiated at 1–4. The share loop is uniform in the index and
   carries no state beyond the running `assigned` total, so the small cases
   exercise every distinct path. Larger counts are covered by unit tests and by
   the property test.
2. **Full-width amounts against fully symbolic share vectors.** Covered
   separately along each dimension, per the tier table, and jointly only by the
   property test.
3. **Exactness above `2^16`.** Invariant 4 is proven for amounts below `2^16`.
   Above it, conservation, dust and the part bounds (invariants 1–3, 6) still
   hold over the entire `i128` range — so value cannot be created or destroyed
   there, but the proofs do not by themselves rule out a *differently rounded*
   split at large amounts. `large_payment_does_not_overflow_share_math` covers
   `i128::MAX / 100` concretely.
4. **The Soroban host.** Storage, token transfers, authorization, TTL, and
   reentrancy are outside the model entirely. `model.rs` asserts conservation
   over a *ledger*, not over real balances; that the contract's loops match the
   model is maintained by review and by the contract's own test suite. In
   particular, nothing here proves anything about fee-on-transfer tokens (see
   `deposit`'s balance-delta crediting), cascade depth, or escrow accounting
   across calls.
5. **The compiler and the model checker.** Proofs are about the Rust source as
   Kani compiles it, not about the emitted Wasm.

## Running the proofs

```sh
cargo install --locked kani-verifier && cargo kani setup   # one-off, ~10 min

just verify          # fast tier: all share vectors, bounded amounts
just verify-full     # full i128 amounts, fixed share vectors
just verify-mutants  # confirm the proofs still fail on broken math
```

Related: #52 (property tests), #42 (the overflow this pins down), #88 (threat
model).
