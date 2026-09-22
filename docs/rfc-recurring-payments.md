# RFC: Recurring scheduled payments via delegated authorization and an off-chain keeper

Status: **Draft — for maintainer review before implementation begins** (per issue #347's own acceptance criteria).

This document is the deliverable for issue #347. Per that issue's acceptance criteria ("Maintainer-approved RFC with an explicit threat model before implementation"), this RFC intentionally does **not** include contract code, a keeper service, or SDK changes. It proposes a design and works through the threat model the issue asks for; implementation should be a separate follow-up once this is reviewed.

## 1. Problem

Every payment through `SplitterContract` today (`pay`, `pay_many`, `pay_many_multi`) requires `from.require_auth()` — a human (or an already-authorized caller) signs each transaction. There is no way to say "pay split #7 100 USDC on the 1st of every month" without a human signing every month. Soroban has no native cron, so recurring payments need two cooperating pieces:

1. An **on-chain mandate**: a standing, bounded authorization the payer grants once, that a contract can enforce without requiring a fresh signature per execution.
2. An **off-chain keeper**: a service that notices a mandate is due and submits the transaction that actually moves funds.

This is explicitly distinct from the existing escrow/`deposit`+`distribute` flow (continuous release of already-locked funds) — a mandate pulls from the payer's *live, unlocked* balance on a schedule, which is a fundamentally different trust problem: the payer's ongoing liquidity is at stake, not a fixed amount they already set aside.

## 2. Design

### 2.1 On-chain mandate lifecycle

A new `Mandate` record, keyed by a `mandate_id` (same `u64`-counter pattern as `Split`/`id` today):

```
Mandate {
    payer: Address,
    split_id: u64,          // reuses the existing SplitterContract split as the payment target
    token: Address,
    amount: i128,            // amount moved per execution
    interval_ledgers: u32,   // minimum ledger-sequence gap between executions
    max_runs: u32,           // 0 = unbounded (bounded only by expiry)
    runs_completed: u32,
    expiry_ledger: u32,
    last_execution_ledger: u32,  // 0 until first run
    status: MandateStatus,  // Active | Revoked | Expired
}
```

Four entrypoints, mirroring the existing contract's naming and auth conventions:

- **`create_mandate(env, payer, split_id, token, amount, interval_ledgers, max_runs, expiry_ledger) -> u64`** — `payer.require_auth()`. Validates `split_id` exists (reuses `load(&env, split_id)`), `amount > 0`, `interval_ledgers > 0`, `expiry_ledger > env.ledger().sequence()`. Stores the mandate with `status = Active`, `runs_completed = 0`, `last_execution_ledger = 0`. This is the payer's one signature — everything after this point runs without them.
- **`execute_mandate(env, mandate_id)`** — **no `require_auth()` at all**. This is the entire point: it must be callable by anyone (an untrusted keeper, a different keeper as backup, even the payer themselves) because the contract's own logic — not the caller's identity — is what makes over-pulling impossible. See §3.
- **`revoke_mandate(env, mandate_id)`** — `payer.require_auth()` (or a `controller`-style delegate, following the same optional-controller pattern the existing `Split` type already uses — open question, see §5). Sets `status = Revoked` immediately. A revoked mandate can never execute again, full stop.
- **`get_mandate(env, mandate_id) -> Mandate`** — read-only view, no auth, mirrors the existing `splits_of`/`split_count`-style getters.

### 2.2 Authorization primitive: contract-enforced rate limiting, not custom signature delegation

The issue asks how Soroban authorization (`require_auth`, auth entries, or an allowance) can represent "the contract may pull up to X per interval" without the payer signing each run. The concrete proposal:

- **Don't build custom signature delegation.** Soroban's `require_auth()` model is per-invocation; there is no native primitive for "sign once, valid for N future calls" that would be safe to build outside of already-audited standards. Inventing one is exactly the kind of novel-crypto risk this RFC should avoid.
- **Instead, reuse the token's existing SEP-41 `approve` allowance mechanism.** At `create_mandate` time (as part of the same payer-signed transaction, so no extra signature burden), the payer's `require_auth()`-signed transaction also invokes the token contract's `approve(payer, splitter_contract_address, total_authorized, expiry_ledger)`, where `total_authorized = amount * max_runs` (or `i128::MAX`-bounded-by-`expiry_ledger` if `max_runs == 0`, capped at some sane ceiling — an unbounded allowance is a real footgun and should not be the default).
- `execute_mandate` then calls `token.transfer_from(splitter_contract_address, payer, split_vault, amount)` — a standard SEP-41 call that **the token contract itself** rejects if the remaining allowance is insufficient. This means the "may not over-pull" guarantee is enforced by the token contract's own allowance accounting, which is a well-understood, already-relied-upon primitive (`transfer_from` semantics), not new contract logic that has to be trusted from scratch.
- The mandate's own `interval_ledgers`/`last_execution_ledger` check (below) is what prevents pulling the *full* allowance in one shot before the schedule allows it — the allowance bounds the *lifetime total*, the mandate bounds the *rate*.

### 2.3 Per-interval rate limiting (on-chain, not keeper-trusted)

Inside `execute_mandate`, before any transfer:

```
let mandate = load_mandate(&env, mandate_id)?;
if mandate.status != MandateStatus::Active {
    return Err(Error::MandateNotActive);
}
let now = env.ledger().sequence();
if now > mandate.expiry_ledger {
    // lazily flip to Expired and reject, mirroring the existing lazy-expiry
    // pattern already used elsewhere in this contract for draft-style state
    return Err(Error::MandateExpired);
}
if mandate.max_runs > 0 && mandate.runs_completed >= mandate.max_runs {
    return Err(Error::MandateExhausted);
}
if mandate.last_execution_ledger != 0
    && now < mandate.last_execution_ledger + mandate.interval_ledgers {
    return Err(Error::MandateNotDue);
}
```

This is the core safety property: **every check is against on-chain state (`env.ledger().sequence()`, the mandate's own stored counters), never against anything the caller supplies or claims.** A malicious or buggy keeper cannot pass a fake "it's been long enough" flag — there is no such parameter. The only inputs to `execute_mandate` are `mandate_id`; everything else is derived from stored state.

### 2.4 Replay and idempotency

Because `execute_mandate` takes no caller-supplied timing/amount data, replay is naturally bounded: calling it twice in the same ledger (or before `interval_ledgers` has elapsed) hits the `MandateNotDue` check on the second call. The state mutation (`last_execution_ledger = now; runs_completed += 1`) must happen **before** the `transfer_from` call completes is irrelevant to Soroban's execution model (the whole invocation is atomic — either the full function succeeds and its storage writes commit, or it reverts and nothing does), but the *order* of "check → transfer → update counters" inside the function still matters for correctness under Soroban's synchronous, single-invocation atomicity: if `transfer_from` fails (e.g., allowance exhausted early, payer's balance too low), the whole call reverts and `runs_completed`/`last_execution_ledger` are correctly left unchanged, so a retry by the same or a different keeper is safe and will re-attempt cleanly.

### 2.5 Revocation and expiry — immediate and final

- `revoke_mandate` is a synchronous state flip to `MandateStatus::Revoked` within a single signed transaction — there is no propagation delay, no "pending revocation" window. The very next `execute_mandate` call (even one already in-flight in the mempool, since Soroban re-validates contract state at execution time, not submission time) sees `status != Active` and reverts.
- Expiry is equally final: once `now > expiry_ledger`, `execute_mandate` always rejects, permanently, no matter how many times it's retried.
- The payer's separate token `approve` allowance is **not** automatically zeroed by `revoke_mandate` (the splitter contract cannot force the token contract to do this on the payer's behalf without the payer's own signed instruction). This is a real gap: a revoked mandate stops the splitter from pulling funds, but the underlying allowance technically still exists until it naturally expires or the payer separately re-approves 0. This should be called out explicitly to users at revoke time (surfaced by the SDK/UI, not silently left as a footgun) — and is one of the open questions in §5.

### 2.6 Keeper service (off-chain, untrusted by design)

Since the entire safety model in §2.2–2.4 assumes the keeper is untrusted, the keeper itself is comparatively simple:

- Poll `get_mandate` for known mandate IDs (or scan a `mandates_due_before(ledger) -> Vec<u64>` view function — worth adding purely as a keeper-liveness convenience, not a trust boundary, since it can only ever return data the caller could otherwise assemble by iterating known IDs) and call `execute_mandate(mandate_id)` for any that look due.
- Because `execute_mandate` is idempotent-safe per §2.4, the keeper needs **no persistent local state to be correct** — it can crash and resume by just re-scanning and re-attempting; a `MandateNotDue` or `MandateExhausted` rejection on a stale attempt is a harmless no-op, not a bug. A local cache of "recently executed" IDs is a pure optimization to avoid wasted submission attempts/fees, not a correctness requirement — this directly satisfies the "stateless-recoverable" acceptance criterion.
- Should support a `--dry-run` mode that calls `execute_mandate` via simulation (Soroban's `simulateTransaction`) without submitting, for operators to sanity-check what would happen before running for real.
- **Backoff**: standard exponential backoff on RPC/submission failure; a `MandateNotDue` response is not a failure to back off from, it's an expected "not yet" — the keeper should simply not retry that specific mandate until its next scheduled poll.

## 3. Threat model

| Threat | Mitigation |
|---|---|
| Keeper (or anyone) executes a mandate early | `execute_mandate` checks `now >= last_execution_ledger + interval_ledgers` against on-chain state only; no caller input can bypass this. |
| Keeper (or anyone) executes a mandate more times than `max_runs` | `runs_completed` is incremented on-chain inside the same atomic call that performs the transfer; checked before every execution. |
| Keeper (or anyone) pulls more than the authorized amount, in total, across all runs | Bounded by the token's own SEP-41 allowance (§2.2), enforced by the token contract, not the splitter. |
| Payer wants to stop a mandate immediately | `revoke_mandate` is a same-transaction, final state flip; no in-flight execution can succeed afterward (§2.5). |
| Mandate outlives its intended lifetime | `expiry_ledger` is checked on every execution attempt, unconditionally. |
| Race: two keepers call `execute_mandate` for the same mandate at nearly the same ledger | Soroban transactions for the same contract/storage key are serialized at the ledger-close level; the second transaction to actually commit sees the already-updated `last_execution_ledger`/`runs_completed` and is rejected by the same on-chain check as any other "too early" attempt. No special-case locking is needed beyond the existing check-then-write ordering. |
| Malicious keeper submits `execute_mandate` for a mandate ID that isn't theirs, to grief the payer | Not actually harmful: execution moves funds *to the split the payer themselves configured* at `create_mandate` time, gated by amount/schedule the payer themselves set. A third party "helpfully" executing an already-due, already-authorized payment on the payer's behalf is the intended behavior (permissionless execution, like the existing `distribute()`), not an attack. The payer is never worse off than if the payment had run on schedule. |
| Malicious keeper *withholds* execution to harm the payer (e.g., a payroll payment that should have run doesn't) | This is a liveness risk, not a safety risk — see §4 (catch-up vs. skip) and §6 (keeper redundancy). No single keeper should be a trust bottleneck; multiple independent keepers (anyone can run one, since `execute_mandate` is permissionless) mitigate this the same way permissionless `distribute()` already does today. |
| Revoked mandate's leftover token `approve` allowance is exploited after revocation | Explicitly flagged as an open gap in §2.5/§5 — the splitter contract cannot unilaterally revoke a SEP-41 allowance it doesn't own. Must be resolved (either via a documented UX flow that also zeroes the allowance, or a different allowance-scoping mechanism) before implementation, not deferred silently. |

## 4. Open design question: catch-up vs. skip on a missed interval

If no keeper executes a due mandate for several intervals (e.g., all keepers were down for a week and `interval_ledgers` corresponds to "daily"), should `execute_mandate` on the next successful call:

- **(a) Skip** — treat it as one execution, reset `last_execution_ledger = now`, and the missed days are simply gone (the payer paid less than the nominal schedule implied over that period), or
- **(b) Catch-up** — allow multiple executions in one call (or track a "runs owed" counter) to make up the gap, up to some bound?

**Recommendation for the initial version: skip.** Catch-up multiplies the complexity of the on-chain rate-limit logic (now it's not "at most 1 execution per interval" but "at most N executions where N depends on elapsed time," which reopens exactly the kind of over-pull surface §3 is designed to close) for a liveness edge case that's better solved by *not letting keepers go down for a week* (§6) than by contract complexity. This should be explicitly confirmed or overridden by the maintainer during RFC review, not assumed.

## 5. Open questions for maintainer review

1. **Allowance revocation UX** (§2.5): how should the leftover SEP-41 allowance be handled when a mandate is revoked? Options: document that users must separately zero their allowance; have `revoke_mandate` require the payer's authorization to *also* attempt a same-transaction `approve(..., 0)` on the token (couples the two contracts more tightly); or scope allowances more narrowly some other way.
2. **Mandate controller/delegation**: should `revoke_mandate` support a `controller`-style delegate the way `Split` already does, or should it always be strictly payer-only? A payer-only model is simpler and safer as a first version.
3. **Fee responsibility for `execute_mandate`**: who pays the Soroban transaction fee for each execution — the keeper operator (as a cost of running the service, potentially subsidized by a separate fee-sharing arrangement out of scope for this contract), or is a small fee skimmed from the mandate's payment amount to reimburse the executing keeper (which would need its own careful design to avoid becoming a new "who gets to claim the keeper-fee" race)? This RFC does not resolve it — the acceptance criteria explicitly requires this to be "defined and documented" before implementation, so it needs a maintainer decision.
4. **`mandates_due_before` view function** (§2.6): worth adding as a keeper-liveness convenience, or is per-ID polling by known mandate IDs sufficient for the first version? A due-list view avoids keepers needing an external index of mandate IDs, but adds a scan-cost/pagination concern (similar to the existing `splits_of_paged` pattern) that should be scoped deliberately.
5. **Allowance ceiling for `max_runs == 0` (unbounded) mandates**: what's the sane cap referenced in §2.2? Needs a concrete number/policy, not left as "some ceiling."

## 6. Deliverables once this RFC is approved

Per the issue's own deliverables list, unchanged and not started as part of this RFC:

- Contract: mandate lifecycle (`create_mandate`, `execute_mandate`, `revoke_mandate`, `get_mandate`) with the on-chain interval enforcement and events described above (`MandateCreated`, `MandateExecuted`, `MandateRevoked`, `MandateExpired`, following the existing `SplitPaid`-style event pattern).
- Keeper service (Node), with due-detection, submission, backoff, and `--dry-run`, per §2.6.
- SDK helpers and tests, including the adversarial tests §3 implies: double-execute, early-execute, over-amount (allowance exhaustion), post-revoke, post-expiry.
- A concrete answer to each open question in §5 before or as part of implementation.
