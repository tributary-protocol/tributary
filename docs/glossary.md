# Glossary

Core terms used throughout the Tributary protocol and documentation.

---

## Split

A **split** is an on-chain routing rule that defines how incoming payments are divided among recipients. Each split has a unique numeric ID and stores:

- **recipients** — A list of up to 32 addresses or child split IDs that receive a portion of every payment.
- **shares** — Basis-point weights (summing to exactly 10,000) that determine each recipient's cut.
- **controller** — An optional address authorized to update the split's recipients and shares. If `None`, the split is immutable forever.

Splits are created with `create_split` and can be paid directly via `pay` or funded over time via `deposit` + `distribute`.

---

## Share

A **share** is a weight expressed in **basis points** (1/100 of a percent). Every split's shares must sum to **10,000** (representing 100%). For example, a three-way split with shares `[5000, 3000, 2000]` allocates 50%, 30%, and 20% respectively.

Share math rounds each recipient's amount **down**; the leftover **dust** goes to the last recipient, guaranteeing amount-in equals amount-out.

Basis points avoid floating-point arithmetic entirely. Instead of computing 33.33% of a payment, the contract computes `amount * 3333 / 10000`, which stays in integer arithmetic with no precision loss.

---

## Controller

The **controller** is an optional Stellar address assigned at split creation (or later via `transfer_control`). Only the controller may:

- Update recipients and shares (`update_split`)
- Transfer control to another address or renounce it (`transfer_control`)
- Close the split and reclaim storage (`close_split`)

If no controller is set (`None`), the split is **locked** — its routing table can never change. This is useful for trustless setups where the routing rule should be permanent.

---

## Escrow

**Escrow** refers to funds held inside the contract on behalf of a split. When `deposit` is called, the token amount is transferred to the contract and credited to `Balance(id, token)`. The funds sit in escrow until anyone calls `distribute`, which pays the full credited balance out to recipients according to the split's shares.

Escrow is useful when money arrives over time and payouts happen on a schedule. Instead of paying each time funds arrive, callers `deposit` and someone later triggers `distribute` to pay everyone at once.

Child splits (recipients of type `Split(u64)`) receive their portion as escrow credit rather than an immediate transfer, enabling composable routing trees without unbounded transaction size.

---

## Dust

**Dust** is the rounding remainder when a payment amount does not divide cleanly by the share basis points. Because each recipient's amount is computed as `floor(amount * share / 10000)`, the sum of rounded amounts can be slightly less than the total. The protocol assigns the difference to the **last recipient**, so the full input amount is always distributed with no loss.

Example: 100 units split `[3333, 3333, 3334]` → `[33, 33, 34]`. The extra unit (100 − 33 − 33 = 34) is dust absorbed by the last recipient.
