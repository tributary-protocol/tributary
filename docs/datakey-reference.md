# DataKey Reference

The Tributary splitter contract uses the `DataKey` enum to organize data in Soroban storage. Each variant represents a different type of data stored by the contract.

## Overview

`DataKey` is a `#[contracttype]` enum that defines the storage keys used throughout the contract. These keys determine how data is organized and retrieved from both instance and persistent storage.

## Variants

### Count

**Storage Type:** Instance storage  
**Value Type:** `u64`

Stores the total number of splits created by the contract. This value is used as a counter for generating new split IDs. When a new split is created, the contract reads the current count, uses it as the new split ID, and then increments the counter.

**Usage:**
- Read in `create_split` to generate the next split ID
- Incremented after each successful split creation
- Exposed via `split_count` public function for querying

**Example:**
```rust
let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
env.storage().instance().set(&DataKey::Count, &(id + 1));
```

---

### Split

**Storage Type:** Persistent storage  
**Value Type:** `Split` struct  
**Key Parameter:** `u64` (split ID)

Stores the complete configuration for a specific split. The `Split` struct contains:

- `recipients`: `Vec<Recipient>` - List of recipients (accounts or child splits)
- `shares`: `Vec<u32>` - Basis point shares for each recipient (must sum to 10,000)
- `controller`: `Option<Address>` - Optional controller address for mutable splits

**Usage:**
- Written in `create_split` when a new split is created
- Updated in `update_split` when the routing table changes
- Read in `pay`, `distribute`, `get_split`, and other operations that need split configuration
- Removed in `close_split` when a split is permanently deleted

**Example:**
```rust
let split = Split {
    recipients,
    shares,
    controller,
};
env.storage().persistent().set(&DataKey::Split(id), &split);
```

---

### Balance

**Storage Type:** Persistent storage  
**Value Type:** `i128`  
**Key Parameters:** `(u64, Address)` (split ID, token address)

Stores the escrowed balance for a specific split and token. This represents funds that have been deposited into the contract for this split but not yet distributed to recipients.

**Usage:**
- Credited in `deposit` when funds are deposited into escrow
- Credited in `pay` when a payment to a child split is routed through escrow
- Debited in `distribute` when funds are paid out to recipients
- Read in `balance` function to query current escrowed amount
- Automatically extends TTL when accessed to prevent storage expiration

**Example:**
```rust
let key = DataKey::Balance(id, token.clone());
let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
env.storage().persistent().set(&key, &(held + amount));
```

---

### Created

**Storage Type:** Persistent storage  
**Value Type:** `Vec<u64>`  
**Key Parameter:** `Address` (creator address)

Stores the list of split IDs created by a specific address. This allows efficient lookup of all splits created by a particular creator.

**Usage:**
- Appended to in `create_split` when a new split is created
- Read in `splits_of`, `splits_of_paged`, and `splits_of_count` to query creator's splits
- Supports pagination via `splits_of_paged` for large creator lists
- Automatically extends TTL when accessed

**Example:**
```rust
let index_key = DataKey::Created(creator.clone());
let mut created: Vec<u64> = env.storage().persistent().get(&index_key).unwrap_or_else(|| Vec::new(&env));
created.push_back(id);
env.storage().persistent().set(&index_key, &created);
```

---

## Additional Variants

### HeldTokens

**Storage Type:** Persistent storage  
**Value Type:** `Vec<Address>`  
**Key Parameter:** `u64` (split ID)

Stores the list of token addresses that have non-zero balances for a specific split. This is used to efficiently track which tokens need distribution without scanning all possible tokens.

### PendingController

**Storage Type:** Persistent storage  
**Value Type:** `Address`  
**Key Parameter:** `u64` (split ID)

Stores the pending controller address during a two-step control transfer. This variant exists only while a transfer is pending and is removed after the transfer is accepted or cancelled.

---

## Storage Types

The contract uses two types of Soroban storage:

- **Instance storage:** Data tied to the contract instance itself. Used for `Count` since the counter is global to the contract.
- **Persistent storage:** Data that persists across contract invocations with time-to-live (TTL) management. Used for split-specific data like `Split`, `Balance`, and `Created`.

## TTL Management

Most persistent storage entries use automatic TTL extension:
- When data is accessed, its TTL is extended to `TTL_EXTEND_TO` (120 days of ledgers)
- This prevents frequently-accessed data from expiring
- The threshold for extension is `TTL_THRESHOLD` (30 days of ledgers)
