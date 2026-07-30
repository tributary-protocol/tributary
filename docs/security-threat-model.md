# Security & Threat Model

This document outlines the security architecture, trust assumptions, escrow risk mitigation, token assumptions, and known limitations of the Tributary contract protocol.

---

## 1. Trust Assumptions & Roles

The Tributary protocol operates under a role-based access model, with distinct trust levels for each participant:

### 1.1 Actors & Authorization
* **Payer**: Any external account or contract that triggers payments (`pay`, `pay_many`, `pay_many_multi`) or deposits escrow (`deposit`). Payers must verify the split configuration before initiating transactions, as transfers and deposits are irreversible.
* **Creator**: The identity that deploys a split configuration via `create_split`. The creator does not retain administrative control over the split unless they are designated as the split's `controller`.
* **Controller**: An optional address (`controller: Option<Address>`) that holds administrative rights over a specific split.
  * **Mutable Splits**: If a controller is specified, they can update recipients/shares (`update_split`), transfer control (`transfer_control`), or close the split (`close_split`). Payers and recipients must trust the controller not to act maliciously (e.g., front-running payouts or updating shares to steal funds).
  * **Immutable Splits**: If the controller is set to `None`, the split is permanently locked and cannot be updated, transferred, or closed by anyone.
* **Recipient**: An address (or child split ID) that receives a share of payments. Recipients do not need to sign or approve incoming payments.

### 1.2 System-level Trust
* **Non-Upgradeable Code**: The contract contains no upgrade mechanism. Users only trust the logic of the specific deployed contract address.
* **Host Environment Integrity**: The contract relies on the Soroban runtime for correct transaction authorization via `require_auth()` and standard ledger state storage.
* **Permissionless Distribution**: Anyone can trigger `distribute(id, token)`. However, the destination of the distributed funds is strictly constrained by the immutable routing table of the split.

---

## 2. Escrow & Balance Accounting Risks

Escrowed funds are held in the contract's balance and tracked logically per split and token.

### 2.1 Balance Verification & Fee-on-Transfer
When calling `deposit(from, id, token, amount)`, the contract performs a token transfer to its own address. Rather than trusting the passed `amount` parameter, it verifies the actual balance increase:
```rust
let before = client.balance(&vault);
client.transfer(&from, &vault, &amount);
let received = client.balance(&vault) - before;
```
This protects the protocol against fee-on-transfer tokens, ensuring that only the actual amount received is credited to the split's balance.

### 2.2 Deep Nesting and Recursion Safety
Tributary allows routing payments to nested splits (`Recipient::Split(child)`).
* **Escrow Path**: When a nested split is paid or distributed, the child split's portion is credited to its escrow balance (`credit`) instead of making recursive contract calls. This flat architecture prevents call-stack overflow vulnerabilities and mitigates complex reentrancy vectors.
* **Direct Pay Path**: `pay` executes transfers directly. If a split has multiple nested layers, payers should use `deposit` and `distribute` to avoid exceeding transaction gas limits or execution depth limits.

### 2.3 Reentrancy Mitigation
The contract implements a strict checks-effects-interactions pattern. In `distribute`, the split's balance is checked and deleted from state *before* initiating any outward token transfers:
```rust
let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
// ...
env.storage().persistent().remove(&key); // State cleared before transfers
payout(&env, &split, &env.current_contract_address(), &token, amount);
```
This design completely eliminates the possibility of reentrant balance drains.

---

## 3. Token Assumptions

The contract assumes that all interacted tokens are standard and well-behaved:

* **SEP-41 Compliance**: The contract expects interacting tokens to conform to Stellar's SEP-41 token standard.
* **Malicious Token Contracts**: If a split uses a non-standard or malicious token contract, the token may fail to execute transfers correctly, revert transactions, or execute unauthorized reentrancy.
* **Arithmetic Precision & Overflow**:
  * All division remainders (dust) are rounded down and routed to the last recipient in the split to ensure that the sum of parts exactly equals the total amount.
  * Share math is computed in 256-bit space (`I256`) to protect the intermediate product `amount * share` from overflowing the standard `i128` integer limit.
  * If the final calculated share exceeds the `i128` boundary, the contract returns a typed `ArithmeticOverflow` error instead of panicking.

---

## 4. Known Limitations

* **Permanent Lock-in**: If a split's controller is `None`, there is no mechanism to recover funds or update routing if recipient keys are compromised or lost.
* **Max Recipient Limit**: Each split configuration is limited to a maximum of 32 recipients (`MAX_RECIPIENTS = 32`).
* **State Expiry / TTL**: Persistent ledger entries (`Split` and `Balance`) must maintain active TTLs. Active splits automatically extend their TTLs on lookup/updates. Completely dormant splits may expire and require ledger restoration before they can be interacted with again.
* **Rounding Dust Allocation**: Because the last recipient in the split receives the rounding dust, they may receive a marginally higher amount than their exact share in high-frequency, low-value splits.
