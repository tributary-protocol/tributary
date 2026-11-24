#!/usr/bin/env bash
# Mutation check for the Kani proofs (#352).
#
# A proof that cannot fail proves nothing. This script breaks the share
# arithmetic on purpose, one mutant at a time, and requires the proofs to
# catch every one. If a mutant survives, the corresponding harness is not
# actually constraining the thing it claims to constrain.
#
# Usage: scripts/kani-mutation-check.sh [extra cargo-kani args...]
set -uo pipefail

cd "$(dirname "$0")/.."

# mutant feature | harness that must fail
MUTANTS=(
  "mutant-round-up|proof_bounded_split_part_total"
  "mutant-narrow-mul|proof_full_part_bounds_share_3333"
  "mutant-fixed-dust|proof_full_conservation_thirds"
  "mutant-loose-total|proof_shares_sound_n3"
)

failures=0

for entry in "${MUTANTS[@]}"; do
  feature="${entry%%|*}"
  harness="${entry##*|}"
  printf '\n=== %s must be caught by %s\n' "$feature" "$harness"

  if cargo kani -p tributary-splitter-proofs \
      --features "$feature" --harness "proofs::$harness" --exact "$@" > "${TMPDIR:-/tmp}/kani-mutant.log" 2>&1; then
    printf 'SURVIVED: %s passed with %s applied — the proof is too weak.\n' \
      "$harness" "$feature"
    tail -20 "${TMPDIR:-/tmp}/kani-mutant.log"
    failures=$((failures + 1))
  else
    printf 'caught: %s fails as expected under %s\n' "$harness" "$feature"
  fi
done

printf '\n'
if [ "$failures" -ne 0 ]; then
  printf '%d mutant(s) survived.\n' "$failures"
  exit 1
fi
printf 'All %d mutants caught.\n' "${#MUTANTS[@]}"
