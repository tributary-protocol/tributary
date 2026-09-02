#![no_std]
#![allow(clippy::missing_errors_doc, clippy::needless_pass_by_value)]
//! Splits incoming payments between recipients by fixed basis-point shares.
//!
//! A split routes to accounts or to other splits. Payments either go straight
//! through (`pay`) or sit in escrow per split and token (`deposit`) until
//! someone triggers `distribute`. Share math rounds down and hands the dust
//! to the last recipient, so amount in always equals amount out.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contractmeta, contracttype, token,
    Address, Env, Vec,
};

pub mod math;

pub use math::{MAX_RECIPIENTS, TOTAL_SHARES};

contractmeta!(key = "name", val = "tributary-splitter");
contractmeta!(
    key = "source",
    val = "https://github.com/tributary-protocol/tributary"
);

pub const MAX_CASCADE_DEPTH: u32 = 5;
pub const MAX_DISTRIBUTE_TOKENS: u32 = 10;

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS;
const TTL_EXTEND_TO: u32 = 120 * DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// Code 1. The recipient list is empty.
    /// Raised by `create_split`, `update_split` (via `validate`), and
    /// `pay_many` (empty `ids` list).
    NoRecipients = 1,
    /// Code 2. The `recipients` and `shares` vectors have different lengths.
    /// Raised by `create_split`, `update_split` (via `validate`), and
    /// `pay_many` (mismatched `ids`/`amounts`).
    LengthMismatch = 2,
    /// Code 3. A share value is `0`.
    /// Raised by `create_split` and `update_split` (via `validate`).
    ZeroShare = 3,
    /// Code 4. Shares do not sum to `TOTAL_SHARES` (`10_000`), or the sum
    /// overflows `u32`.
    /// Raised by `create_split` and `update_split` (via `validate`).
    BadShareTotal = 4,
    /// Code 5. The split `id` does not exist in storage.
    /// Raised by `pay`, `pay_many`, `update_split`, `transfer_control`,
    /// `distribute`, `preview_payout`, and `get_split` (all via `load`).
    SplitNotFound = 5,
    /// Code 6. An edit was attempted on a split with `controller == None`.
    /// Raised by `update_split` and `transfer_control`.
    SplitImmutable = 6,
    /// Code 7. The payment amount is zero or negative.
    /// Raised by `pay`, `pay_many`, `deposit`, and `preview_payout`.
    InvalidAmount = 7,
    /// Code 8. `distribute` was called on a split/token with an empty
    /// escrow balance.
    /// Raised by `distribute`.
    NothingToDistribute = 8,
    /// Code 9. More than `MAX_RECIPIENTS` (32) recipients were supplied.
    /// Raised by `create_split` and `update_split` (via `validate`).
    TooManyRecipients = 9,
    /// Code 10. A `Recipient::Split(child)` reference is unknown, or a split
    /// references itself (directly or as its own update target).
    /// Raised by `create_split` and `update_split` (via `validate`).
    BadChildSplit = 10,
    /// An arithmetic path produced a value that does not fit the i128 the
    /// contract stores. Can only happen if a share exceeds `TOTAL_SHARES`, which
    /// `validate` forbids, but we surface it as a typed error rather than panic.
    ArithmeticOverflow = 11,
    /// Code 12. Raised by `close_split` when the split still holds a
    /// balance, and by `update_split` when the split holds a balance in any
    /// token — the routing table cannot be changed out from under money that
    /// was deposited against it. Call `distribute` first.
    SplitHasBalance = 12,
    /// Code 13. The cascade depth exceeds the maximum allowed limit.
    MaxDepthExceeded = 13,
    /// Code 14. The number of tokens to distribute exceeds the allowed limit.
    TooManyTokens = 14,
    /// Code 15. No pending control transfer exists for this split.
    NoPendingTransfer = 15,
    /// Code 16. Start time is after end time, or start/end times are invalid.
    InvalidTimeBounds = 16,
    /// Code 17. The stream ID does not exist in storage.
    StreamNotFound = 17,
    /// Code 18. Caller is not the stream's funder.
    NotStreamFunder = 18,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub split_id: u64,
    pub funder: Address,
    pub token: Address,
    pub amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub withdrawn: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Recipient {
    Account(Address),
    Split(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub recipients: Vec<Recipient>,
    pub shares: Vec<u32>,
    pub controller: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenDistribution {
    pub token: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Stores the total number of splits created. Used as a counter for generating
    /// new split IDs. Value is a `u64` stored in instance storage.
    Count,
    /// Stores the split configuration for a given split ID. The value is a `Split`
    /// struct containing recipients, shares, and controller. Stored in persistent
    /// storage keyed by the split ID.
    Split(u64),
    /// Stores the escrowed balance for a specific split and token. The value is an
    /// `i128` representing the amount of the token held in escrow for that split.
    /// Stored in persistent storage keyed by (split_id, token_address).
    Balance(u64, Address),
    /// Stores the list of split IDs created by a specific address (creator). The value
    /// is a `Vec<u64>` containing all split IDs created by that address. Stored in
    /// persistent storage keyed by the creator's address.
    Created(Address),
    /// Stores the list of tokens that have non-zero balances for a specific split.
    /// The value is a `Vec<Address>` of token addresses. Used to efficiently track
    /// which tokens need distribution. Stored in persistent storage keyed by split ID.
    HeldTokens(u64),
    /// Stores the pending controller address during a two-step control transfer.
    /// The value is an `Address` representing the proposed new controller. Stored in
    /// persistent storage keyed by split ID. Removed after transfer is accepted or cancelled.
    PendingController(u64),
    AccountBalance(Address, Address),
    StreamCount,
    Stream(u64),
    StreamsOf(Address),
}

#[contractevent]
#[derive(Clone)]
pub struct StreamCreated {
    #[topic]
    pub id: u64,
    pub funder: Address,
    pub split_id: u64,
    pub token: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct StreamWithdrawn {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct StreamCancelled {
    #[topic]
    pub id: u64,
    pub refunded: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct StreamToppedUp {
    #[topic]
    pub id: u64,
    pub added: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct SplitCreated {
    #[topic]
    pub id: u64,
    pub creator: Address,
}

#[contractevent]
#[derive(Clone)]
pub struct SplitPaid {
    #[topic]
    pub id: u64,
    pub token: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct SplitUpdated {
    #[topic]
    pub id: u64,
}

#[contractevent]
#[derive(Clone)]
pub struct SplitClosed {
    #[topic]
    pub id: u64,
}

#[contractevent]
#[derive(Clone)]
pub struct ControlTransferProposed {
    #[topic]
    pub id: u64,
    pub new_controller: Address,
}

#[contractevent]
#[derive(Clone)]
pub struct ControlTransferred {
    #[topic]
    pub id: u64,
    pub new_controller: Option<Address>,
}

#[contractevent]
#[derive(Clone)]
pub struct Deposited {
    #[topic]
    pub id: u64,
    pub token: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct Distributed {
    #[topic]
    pub id: u64,
    pub token: Address,
    pub amount: i128,
}

#[contract]
pub struct Splitter;

#[contractimpl]
impl Splitter {
    /// Registers a new split and returns its id. Shares are basis points
    /// and must sum to exactly `10_000`. Passing a controller makes the
    /// split mutable by that address; passing None locks it forever.
    pub fn create_split(
        env: Env,
        creator: Address,
        recipients: Vec<Recipient>,
        shares: Vec<u32>,
        controller: Option<Address>,
    ) -> Result<u64, Error> {
        creator.require_auth();
        let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        validate(&env, id, &recipients, &shares)?;
        let split = Split {
            recipients,
            shares,
            controller,
        };
        env.storage().persistent().set(&DataKey::Split(id), &split);
        env.storage().instance().set(&DataKey::Count, &(id + 1));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        let index_key = DataKey::Created(creator.clone());
        let mut created: Vec<u64> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(&env));
        created.push_back(id);
        env.storage().persistent().set(&index_key, &created);
        env.storage()
            .persistent()
            .extend_ttl(&index_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        SplitCreated { id, creator }.publish(&env);
        Ok(id)
    }

    /// Moves `amount` of `token` from the payer to every recipient of the
    /// split in one call. Rounding dust goes to the last recipient.
    pub fn pay(
        env: Env,
        from: Address,
        id: u64,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let split = load(&env, id)?;
        payout(&env, &split, &from, &token, amount);
        SplitPaid { id, token, amount }.publish(&env);
        Ok(())
    }

    /// Pays several splits from one signer in a single transaction.
    /// `ids` and `amounts` pair up positionally; any failure reverts all.
    pub fn pay_many(
        env: Env,
        from: Address,
        ids: Vec<u64>,
        amounts: Vec<i128>,
        token: Address,
    ) -> Result<(), Error> {
        from.require_auth();
        if ids.is_empty() {
            return Err(Error::NoRecipients);
        }
        if ids.len() != amounts.len() {
            return Err(Error::LengthMismatch);
        }
        for amount in amounts.iter() {
            if amount <= 0 {
                return Err(Error::InvalidAmount);
            }
        }
        for i in 0..ids.len() {
            let id = ids.get_unchecked(i);
            let amount = amounts.get_unchecked(i);
            let split = load(&env, id)?;
            payout(&env, &split, &from, &token, amount);
            SplitPaid {
                id,
                token: token.clone(),
                amount,
            }
            .publish(&env);
        }
        Ok(())
    }

    /// Pays several splits from one signer in a single transaction, each
    /// with its own token. `ids`, `amounts`, and `tokens` pair up
    /// positionally; any failure reverts all.
    pub fn pay_many_multi(
        env: Env,
        from: Address,
        ids: Vec<u64>,
        amounts: Vec<i128>,
        tokens: Vec<Address>,
    ) -> Result<(), Error> {
        from.require_auth();
        if ids.is_empty() {
            return Err(Error::NoRecipients);
        }
        if ids.len() != amounts.len() || ids.len() != tokens.len() {
            return Err(Error::LengthMismatch);
        }
        for amount in amounts.iter() {
            if amount <= 0 {
                return Err(Error::InvalidAmount);
            }
        }
        for i in 0..ids.len() {
            let id = ids.get_unchecked(i);
            let amount = amounts.get_unchecked(i);
            let token = tokens.get_unchecked(i);
            let split = load(&env, id)?;
            payout(&env, &split, &from, &token, amount);
            SplitPaid {
                id,
                token: token.clone(),
                amount,
            }
            .publish(&env);
        }
        Ok(())
    }

    /// Replaces the recipients and shares of a mutable split.
    ///
    /// Rejected while the split holds a balance in any token: a depositor
    /// sees the routing table at deposit time, and letting the controller
    /// swap it out before `distribute` runs would let them redirect money
    /// that already arrived. Call `distribute` for every token in
    /// `held_tokens` first.
    pub fn update_split(
        env: Env,
        id: u64,
        recipients: Vec<Recipient>,
        shares: Vec<u32>,
    ) -> Result<(), Error> {
        let mut split = load(&env, id)?;
        let controller = split.controller.clone().ok_or(Error::SplitImmutable)?;
        controller.require_auth();
        if !Self::held_tokens(env.clone(), id).is_empty() {
            return Err(Error::SplitHasBalance);
        }
        validate(&env, id, &recipients, &shares)?;
        split.recipients = recipients;
        split.shares = shares;
        env.storage().persistent().set(&DataKey::Split(id), &split);
        SplitUpdated { id }.publish(&env);
        Ok(())
    }

    /// Proposes transferring control to a new address (two-step), or locks the
    /// split forever when `new_controller` is `None`.
    ///
    /// When `Some(addr)`, a pending controller is recorded and `accept_control`
    /// must be called by that address to finalise the handover. The current
    /// controller can cancel the proposal with `cancel_transfer`.
    ///
    /// When `None`, control is renounced immediately and irreversibly.
    pub fn transfer_control(
        env: Env,
        id: u64,
        new_controller: Option<Address>,
    ) -> Result<(), Error> {
        let split = load(&env, id)?;
        let controller = split.controller.clone().ok_or(Error::SplitImmutable)?;
        controller.require_auth();

        match new_controller {
            None => {
                // Renounce immediately — no recovery possible.
                let mut split = split;
                split.controller = None;
                env.storage().persistent().set(&DataKey::Split(id), &split);
                ControlTransferred {
                    id,
                    new_controller: None,
                }
                .publish(&env);
            }
            Some(addr) => {
                env.storage()
                    .persistent()
                    .set(&DataKey::PendingController(id), &addr);
                env.storage().persistent().extend_ttl(
                    &DataKey::PendingController(id),
                    TTL_THRESHOLD,
                    TTL_EXTEND_TO,
                );
                ControlTransferProposed {
                    id,
                    new_controller: addr,
                }
                .publish(&env);
            }
        }
        Ok(())
    }

    /// Accepts a pending control transfer. Only the proposed controller may
    /// call this, after which they become the split's controller.
    pub fn accept_control(env: Env, id: u64) -> Result<(), Error> {
        let pending = env
            .storage()
            .persistent()
            .get::<_, Address>(&DataKey::PendingController(id))
            .ok_or(Error::NoPendingTransfer)?;

        pending.require_auth();

        let mut split = load(&env, id)?;
        split.controller = Some(pending.clone());
        env.storage().persistent().set(&DataKey::Split(id), &split);
        env.storage()
            .persistent()
            .remove(&DataKey::PendingController(id));

        ControlTransferred {
            id,
            new_controller: Some(pending),
        }
        .publish(&env);
        Ok(())
    }

    /// Cancels a pending control transfer. Only the current controller may
    /// call this. Does nothing if no transfer is pending.
    pub fn cancel_transfer(env: Env, id: u64) -> Result<(), Error> {
        let split = load(&env, id)?;
        let controller = split.controller.clone().ok_or(Error::SplitImmutable)?;
        controller.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::PendingController(id));
        Ok(())
    }

    /// Closes a split and reclaims its storage. Only the controller can do this,
    /// and only if the split holds no balances.
    pub fn close_split(env: Env, id: u64) -> Result<(), Error> {
        let split = load(&env, id)?;
        let controller = split.controller.ok_or(Error::SplitImmutable)?;
        controller.require_auth();

        let tokens = Self::held_tokens(env.clone(), id);
        if !tokens.is_empty() {
            return Err(Error::SplitHasBalance);
        }

        env.storage().persistent().remove(&DataKey::Split(id));
        env.storage()
            .persistent()
            .remove(&DataKey::PendingController(id));
        SplitClosed { id }.publish(&env);
        Ok(())
    }

    /// Moves funds into the contract and credits them to the split without
    /// paying anyone yet. Useful when money arrives before a distribution
    /// should happen.
    ///
    /// Credits the amount the vault's balance actually increased by rather
    /// than the requested `amount`, so fee-on-transfer tokens that deliver
    /// less than requested cannot over-credit the split.
    ///
    /// The routing table cannot be redirected out from under this deposit:
    /// `update_split` refuses to run while the split holds a balance in any
    /// token, so whoever controls the split must `distribute` first. This
    /// only matters for mutable splits (`controller: Some(_)`) — immutable
    /// splits have no routing table to change in the first place.
    pub fn deposit(
        env: Env,
        from: Address,
        id: u64,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        load(&env, id)?;
        let vault = env.current_contract_address();
        let client = token::Client::new(&env, &token);
        let before = client.balance(&vault);
        client.transfer(&from, &vault, &amount);
        let received = client.balance(&vault) - before;
        if received > 0 {
            credit(&env, id, &token, received);
        }
        Ok(())
    }

    /// Pays out everything credited to the split for the given token.
    /// Anyone can call this; the routing table decides where funds go.
    pub fn distribute(env: Env, id: u64, token: Address) -> Result<i128, Error> {
        let (split, amount) = distribute_node(&env, id, &token)?;
        payout(
            &env,
            &split,
            &env.current_contract_address(),
            &token,
            amount,
        );
        Distributed { id, token, amount }.publish(&env);
        Ok(amount)
    }

    /// Distributes a parent split and recursively distributes any freshly-credited
    /// direct children (and their children, etc.) in one call, bounded by `max_depth`.
    ///
    /// Depth Bound & Gas:
    /// - Each level of recursion increases the depth. A `max_depth` of 0 only distributes the parent.
    /// - Each distribution load/writes to persistent storage and does token transfers.
    /// - To prevent out-of-gas errors or stack overflow, `max_depth` must be limited to `MAX_CASCADE_DEPTH` (5).
    pub fn distribute_cascade(
        env: Env,
        id: u64,
        token: Address,
        max_depth: u32,
    ) -> Result<i128, Error> {
        if max_depth > MAX_CASCADE_DEPTH {
            return Err(Error::MaxDepthExceeded);
        }
        distribute_recursive(&env, id, &token, 0, max_depth)
    }

    /// Pays out all escrowed tokens for a split, up to `MAX_DISTRIBUTE_TOKENS` (10).
    /// Returns the list of tokens and their distributed amounts.
    /// If no tokens are specified, retrieves all tokens that currently have balances.
    /// Zero-balance tokens are skipped and do not cause errors.
    pub fn distribute_all_tokens(
        env: Env,
        id: u64,
        tokens: Option<Vec<Address>>,
    ) -> Result<Vec<TokenDistribution>, Error> {
        let _split = load(&env, id)?;
        let tokens_to_process = match tokens {
            Some(t) => t,
            None => Self::held_tokens(env.clone(), id),
        };
        if tokens_to_process.len() > MAX_DISTRIBUTE_TOKENS {
            return Err(Error::TooManyTokens);
        }
        let mut distributions = Vec::new(&env);
        for token in tokens_to_process.iter() {
            let bal = Self::balance(env.clone(), id, token.clone());
            if bal <= 0 {
                continue;
            }
            let (node_split, amount) = distribute_node(&env, id, &token)?;
            payout(
                &env,
                &node_split,
                &env.current_contract_address(),
                &token,
                amount,
            );
            Distributed {
                id,
                token: token.clone(),
                amount,
            }
            .publish(&env);
            distributions.push_back(TokenDistribution { token, amount });
        }
        Ok(distributions)
    }

    /// Returns the exact per-recipient amounts a payment of `amount` would
    /// produce, without moving any funds.
    pub fn preview_payout(env: Env, id: u64, amount: i128) -> Result<Vec<i128>, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let split = load(&env, id)?;
        amounts(&env, &split, amount)
    }

    /// Returns the exact per-leaf-account amounts a payment of `amount` would
    /// ultimately produce, resolving every `Recipient::Split` child recursively
    /// down to `Recipient::Account` leaves.
    ///
    /// Each element is `(address, amount)`.  If the same address appears as a
    /// leaf under more than one branch its amounts are aggregated into a single
    /// entry so the vector has no duplicate addresses.
    ///
    /// Rounding is applied at every level using the same `amounts()` helper
    /// that `pay` and `distribute` use, so dust-to-last-recipient behaviour
    /// matches the actual payment exactly.
    ///
    /// # Depth cap
    ///
    /// Recursion is bounded to **8 levels** of nesting.  At the current limit
    /// of 32 recipients per split that still allows trees with up to 32⁸
    /// theoretical leaf slots, far more than any real-world routing tree.
    /// Calls that would exceed the cap return [`Error::BadChildSplit`].
    pub fn preview_payout_deep(
        env: Env,
        id: u64,
        amount: i128,
    ) -> Result<Vec<(Address, i128)>, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let mut out: Vec<(Address, i128)> = Vec::new(&env);
        resolve_deep(&env, id, amount, 0, &mut out)?;
        Ok(out)
    }

    #[must_use]
    pub fn balance(env: Env, id: u64, token: Address) -> i128 {
        let key = DataKey::Balance(id, token.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount > 0 {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        amount
    }

    pub fn has_split(env: Env, id: u64) -> bool {
        env.storage().persistent().has(&DataKey::Split(id))
    }

    pub fn get_split(env: Env, id: u64) -> Result<Split, Error> {
        load(&env, id)
    }

    pub fn recipient_count(env: Env, id: u64) -> Result<u32, Error> {
        Ok(load(&env, id)?.recipients.len())
    }

    pub fn get_shares(env: Env, id: u64) -> Result<Vec<u32>, Error> {
        Ok(load(&env, id)?.shares)
    }

    #[must_use]
    pub fn held_tokens(env: Env, id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::HeldTokens(id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    #[must_use]
    pub fn splits_of(env: Env, creator: Address) -> Vec<u64> {
        load_created(&env, &creator)
    }

    #[must_use]
    pub fn splits_of_paged(env: Env, creator: Address, start: u32, limit: u32) -> Vec<u64> {
        let all: Vec<u64> = load_created(&env, &creator);
        let len = all.len();
        if start >= len || limit == 0 {
            return Vec::new(&env);
        }
        let mut page = Vec::new(&env);
        let mut i = start;
        let mut count = 0u32;
        while i < len && count < limit {
            page.push_back(all.get_unchecked(i));
            i += 1;
            count += 1;
        }
        page
    }

    #[must_use]
    pub fn splits_of_count(env: Env, creator: Address) -> u32 {
        let all: Vec<u64> = load_created(&env, &creator);
        all.len()
    }

    #[must_use]
    pub fn split_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    #[must_use]
    pub fn pending_controller(env: Env, id: u64) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::PendingController(id))
    }

    /// Claims any fallback balances credited to this account due to failed payouts.
    pub fn claim(env: Env, account: Address, token: Address) -> Result<(), Error> {
        let key = DataKey::AccountBalance(account.clone(), token.clone());
        let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if held == 0 {
            return Err(Error::InvalidAmount);
        }
        env.storage().persistent().remove(&key);
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &account, &held);
        Ok(())
    }

    pub fn create_stream(
        env: Env,
        funder: Address,
        split_id: u64,
        token: Address,
        amount: i128,
        start_time: u64,
        end_time: u64,
    ) -> Result<u64, Error> {
        funder.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if start_time >= end_time {
            return Err(Error::InvalidTimeBounds);
        }
        if !Self::has_split(env.clone(), split_id) {
            return Err(Error::SplitNotFound);
        }

        let client = token::Client::new(&env, &token);
        let vault = env.current_contract_address();
        let before = client.balance(&vault);
        client.transfer(&funder, &vault, &amount);
        let received = client.balance(&vault) - before;
        if received <= 0 {
            return Err(Error::InvalidAmount);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StreamCount)
            .unwrap_or(0);
        let stream = Stream {
            id,
            split_id,
            funder: funder.clone(),
            token,
            amount: received,
            start_time,
            end_time,
            withdrawn: 0,
        };

        let stream_key = DataKey::Stream(id);
        env.storage().persistent().set(&stream_key, &stream);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage()
            .instance()
            .set(&DataKey::StreamCount, &(id + 1));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        let index_key = DataKey::StreamsOf(funder.clone());
        let mut streams: Vec<u64> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(&env));
        streams.push_back(id);
        env.storage().persistent().set(&index_key, &streams);
        env.storage()
            .persistent()
            .extend_ttl(&index_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        StreamCreated {
            id,
            funder,
            split_id,
            token: stream.token,
            amount: stream.amount,
        }
        .publish(&env);

        Ok(id)
    }

    pub fn get_stream(env: Env, id: u64) -> Result<Stream, Error> {
        let key = DataKey::Stream(id);
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::StreamNotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(stream)
    }

    pub fn vested_of(env: Env, id: u64) -> Result<i128, Error> {
        let stream = Self::get_stream(env.clone(), id)?;
        let now = env.ledger().timestamp();
        let elapsed = if now <= stream.start_time {
            0
        } else if now >= stream.end_time {
            stream.end_time - stream.start_time
        } else {
            now - stream.start_time
        };
        let duration = stream.end_time - stream.start_time;
        let vested = math::calculate_vested(stream.amount, elapsed, duration)
            .ok_or(Error::ArithmeticOverflow)?;
        Ok(vested)
    }

    pub fn withdraw_vested(env: Env, id: u64) -> Result<i128, Error> {
        let mut stream = Self::get_stream(env.clone(), id)?;
        let vested = Self::vested_of(env.clone(), id)?;
        let claimable = vested - stream.withdrawn;
        if claimable <= 0 {
            return Err(Error::NothingToDistribute);
        }

        stream.withdrawn += claimable;
        let stream_key = DataKey::Stream(id);
        env.storage().persistent().set(&stream_key, &stream);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let split = load(&env, stream.split_id)?;
        payout(
            &env,
            &split,
            &env.current_contract_address(),
            &stream.token,
            claimable,
        );

        StreamWithdrawn {
            id,
            amount: claimable,
        }
        .publish(&env);
        Ok(claimable)
    }

    pub fn cancel_stream(env: Env, id: u64) -> Result<(), Error> {
        let stream = Self::get_stream(env.clone(), id)?;
        stream.funder.require_auth();

        let vested = Self::vested_of(env.clone(), id)?;
        let claimable = vested - stream.withdrawn;
        let unvested = stream.amount - vested;

        let stream_key = DataKey::Stream(id);
        env.storage().persistent().remove(&stream_key);

        let index_key = DataKey::StreamsOf(stream.funder.clone());
        if let Some(mut streams) = env.storage().persistent().get::<_, Vec<u64>>(&index_key) {
            if let Some(idx) = streams.first_index_of(id) {
                streams.remove(idx);
                if streams.is_empty() {
                    env.storage().persistent().remove(&index_key);
                } else {
                    env.storage().persistent().set(&index_key, &streams);
                    env.storage()
                        .persistent()
                        .extend_ttl(&index_key, TTL_THRESHOLD, TTL_EXTEND_TO);
                }
            }
        }

        let client = token::Client::new(&env, &stream.token);

        if claimable > 0 {
            let split = load(&env, stream.split_id)?;
            payout(
                &env,
                &split,
                &env.current_contract_address(),
                &stream.token,
                claimable,
            );
            StreamWithdrawn {
                id,
                amount: claimable,
            }
            .publish(&env);
        }

        if unvested > 0 {
            client.transfer(&env.current_contract_address(), &stream.funder, &unvested);
        }

        StreamCancelled {
            id,
            refunded: unvested,
        }
        .publish(&env);
        Ok(())
    }

    pub fn top_up(env: Env, id: u64, amount_to_add: i128) -> Result<(), Error> {
        let mut stream = Self::get_stream(env.clone(), id)?;
        stream.funder.require_auth();
        if amount_to_add <= 0 {
            return Err(Error::InvalidAmount);
        }

        let client = token::Client::new(&env, &stream.token);
        let vault = env.current_contract_address();
        let before = client.balance(&vault);
        client.transfer(&stream.funder, &vault, &amount_to_add);
        let received = client.balance(&vault) - before;
        if received <= 0 {
            return Err(Error::InvalidAmount);
        }

        stream.amount += received;
        let stream_key = DataKey::Stream(id);
        env.storage().persistent().set(&stream_key, &stream);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        StreamToppedUp {
            id,
            added: received,
        }
        .publish(&env);
        Ok(())
    }

    #[must_use]
    pub fn streams_of(env: Env, funder: Address) -> Vec<u64> {
        let key = DataKey::StreamsOf(funder);
        if let Some(streams) = env.storage().persistent().get(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
            streams
        } else {
            Vec::new(&env)
        }
    }
}

fn load_created(env: &Env, creator: &Address) -> Vec<u64> {
    let key = DataKey::Created(creator.clone());
    if let Some(created) = env.storage().persistent().get(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        created
    } else {
        Vec::new(env)
    }
}

fn validate(
    env: &Env,
    own_id: u64,
    recipients: &Vec<Recipient>,
    shares: &Vec<u32>,
) -> Result<(), Error> {
    if recipients.is_empty() {
        return Err(Error::NoRecipients);
    }
    if recipients.len() > MAX_RECIPIENTS {
        return Err(Error::TooManyRecipients);
    }
    if recipients.len() != shares.len() {
        return Err(Error::LengthMismatch);
    }
    for recipient in recipients.iter() {
        if let Recipient::Split(child) = recipient {
            let exists = env.storage().persistent().has(&DataKey::Split(child));
            if child == own_id || !exists {
                return Err(Error::BadChildSplit);
            }
        }
    }
    // Share checks live in `math` so Kani can prove them over all inputs.
    math::validate_shares(shares.iter()).map_err(|e| match e {
        math::ShareError::NoRecipients => Error::NoRecipients,
        math::ShareError::TooManyRecipients => Error::TooManyRecipients,
        math::ShareError::ZeroShare => Error::ZeroShare,
        math::ShareError::BadShareTotal => Error::BadShareTotal,
    })
}

fn amounts(env: &Env, split: &Split, amount: i128) -> Result<Vec<i128>, Error> {
    let mut out = Vec::new(env);
    let last = split.recipients.len() - 1;
    let mut assigned: i128 = 0;
    for i in 0..split.recipients.len() {
        let part = if i == last {
            // Dust: whatever rounding left over goes to the last recipient,
            // so the parts sum to `amount` exactly.
            amount - assigned
        } else {
            math::split_part(amount, split.shares.get_unchecked(i))
                .ok_or(Error::ArithmeticOverflow)?
        };
        out.push_back(part);
        assigned += part;
    }
    Ok(out)
}

fn payout(env: &Env, split: &Split, from: &Address, token: &Address, amount: i128) {
    let client = token::Client::new(env, token);
    let vault = env.current_contract_address();

    let last = split.recipients.len() - 1;
    let mut assigned: i128 = 0;

    for i in 0..split.recipients.len() {
        let part = if i == last {
            amount - assigned
        } else {
            match math::split_part(amount, split.shares.get_unchecked(i)) {
                Some(p) => p,
                None => return,
            }
        };
        assigned += part;

        if part <= 0 {
            continue;
        }

        match split.recipients.get_unchecked(i) {
            Recipient::Account(addr) => match client.try_transfer(from, &addr, &part) {
                Ok(Ok(())) => {}
                _ => {
                    if from != &vault {
                        client.transfer(from, &vault, &part);
                    }
                    credit_account(env, &addr, token, part);
                }
            },
            Recipient::Split(child) => {
                if from != &vault {
                    client.transfer(from, &vault, &part);
                }
                credit(env, child, token, part);
            }
        }
    }
}

fn credit_account(env: &Env, account: &Address, token: &Address, amount: i128) {
    let key = DataKey::AccountBalance(account.clone(), token.clone());
    let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(held + amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn credit(env: &Env, id: u64, token: &Address, amount: i128) {
    let key = DataKey::Balance(id, token.clone());
    let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(held + amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

    let tokens_key = DataKey::HeldTokens(id);
    let mut tokens: Vec<Address> = env
        .storage()
        .persistent()
        .get(&tokens_key)
        .unwrap_or_else(|| Vec::new(env));
    if !tokens.contains(token) {
        tokens.push_back(token.clone());
        env.storage().persistent().set(&tokens_key, &tokens);
        env.storage()
            .persistent()
            .extend_ttl(&tokens_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    Deposited {
        id,
        token: token.clone(),
        amount,
    }
    .publish(env);
}

fn load(env: &Env, id: u64) -> Result<Split, Error> {
    let key = DataKey::Split(id);
    let split = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::SplitNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(split)
}

fn distribute_node(env: &Env, id: u64, token: &Address) -> Result<(Split, i128), Error> {
    let split = load(env, id)?;
    let key = DataKey::Balance(id, token.clone());
    let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if amount <= 0 {
        return Err(Error::NothingToDistribute);
    }
    env.storage().persistent().remove(&key);

    let tokens_key = DataKey::HeldTokens(id);
    if let Some(mut tokens) = env
        .storage()
        .persistent()
        .get::<_, Vec<Address>>(&tokens_key)
    {
        if let Some(idx) = tokens.first_index_of(token) {
            tokens.remove(idx);
            if tokens.is_empty() {
                env.storage().persistent().remove(&tokens_key);
            } else {
                env.storage().persistent().set(&tokens_key, &tokens);
                env.storage()
                    .persistent()
                    .extend_ttl(&tokens_key, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
        }
    }
    Ok((split, amount))
}

fn distribute_recursive(
    env: &Env,
    id: u64,
    token: &Address,
    current_depth: u32,
    max_depth: u32,
) -> Result<i128, Error> {
    let (split, amount) = match distribute_node(env, id, token) {
        Ok(res) => res,
        Err(Error::NothingToDistribute) => {
            if current_depth == 0 {
                return Err(Error::NothingToDistribute);
            }
            return Ok(0);
        }
        Err(e) => return Err(e),
    };

    payout(env, &split, &env.current_contract_address(), token, amount);
    Distributed {
        id,
        token: token.clone(),
        amount,
    }
    .publish(env);

    if current_depth < max_depth {
        for i in 0..split.recipients.len() {
            if let Recipient::Split(child_id) = split.recipients.get_unchecked(i) {
                distribute_recursive(env, child_id, token, current_depth + 1, max_depth)?;
            }
        }
    }

    Ok(amount)
}

/// Maximum nesting depth for [`Splitter::preview_payout_deep`].
///
/// At the per-split limit of 32 recipients this still allows trees with
/// millions of leaf slots in practice.  The bound prevents run-away
/// recursion if a future contract upgrade accidentally creates a cycle that
/// bypasses the `validate` guard.
pub const MAX_PREVIEW_DEPTH: u32 = 8;

/// Recursive helper for `preview_payout_deep`.
///
/// Walks the split at `id` and appends `(Address, amount)` leaf entries to
/// `out`, aggregating duplicate addresses.  `depth` is the current recursion
/// level; returns [`Error::BadChildSplit`] when it would exceed
/// [`MAX_PREVIEW_DEPTH`].
fn resolve_deep(
    env: &Env,
    id: u64,
    amount: i128,
    depth: u32,
    out: &mut Vec<(Address, i128)>,
) -> Result<(), Error> {
    if depth > MAX_PREVIEW_DEPTH {
        return Err(Error::BadChildSplit);
    }
    let split = load(env, id)?;
    let parts = amounts(env, &split, amount)?;
    for i in 0..split.recipients.len() {
        let part = parts.get_unchecked(i);
        if part <= 0 {
            continue;
        }
        match split.recipients.get_unchecked(i) {
            Recipient::Account(addr) => {
                // Aggregate into an existing entry if the address already appears.
                let mut found = false;
                for j in 0..out.len() {
                    let (existing_addr, existing_amt) = out.get_unchecked(j);
                    if existing_addr == addr {
                        out.set(j, (existing_addr, existing_amt + part));
                        found = true;
                        break;
                    }
                }
                if !found {
                    out.push_back((addr, part));
                }
            }
            Recipient::Split(child) => {
                resolve_deep(env, child, part, depth + 1, out)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod test;
