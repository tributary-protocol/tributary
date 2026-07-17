#![no_std]
//! Splits incoming payments between recipients by fixed basis-point shares.
//!
//! A split routes to accounts or to other splits. Payments either go straight
//! through (`pay`) or sit in escrow per split and token (`deposit`) until
//! someone triggers `distribute`. Share math rounds down and hands the dust
//! to the last recipient, so amount in always equals amount out.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contractmeta, contracttype, token,
    Address, Env, Vec, I256,
};

contractmeta!(key = "name", val = "tributary-splitter");
contractmeta!(
    key = "source",
    val = "https://github.com/tributary-protocol/tributary"
);

pub const TOTAL_SHARES: u32 = 10_000;
pub const MAX_RECIPIENTS: u32 = 32;

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
    /// Code 4. Shares do not sum to `TOTAL_SHARES` (10_000), or the sum
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
    /// contract stores. Can only happen if a share exceeds TOTAL_SHARES, which
    /// `validate` forbids, but we surface it as a typed error rather than panic.
    ArithmeticOverflow = 11,
    SplitHasBalance = 12,
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
#[derive(Clone)]
enum DataKey {
    Count,
    Split(u64),
    Balance(u64, Address),
    Created(Address),
    HeldTokens(u64),
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
    /// and must sum to exactly 10_000. Passing a controller makes the
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
    pub fn update_split(
        env: Env,
        id: u64,
        recipients: Vec<Recipient>,
        shares: Vec<u32>,
    ) -> Result<(), Error> {
        let mut split = load(&env, id)?;
        let controller = split.controller.clone().ok_or(Error::SplitImmutable)?;
        controller.require_auth();
        validate(&env, id, &recipients, &shares)?;
        split.recipients = recipients;
        split.shares = shares;
        env.storage().persistent().set(&DataKey::Split(id), &split);
        SplitUpdated { id }.publish(&env);
        Ok(())
    }

    /// Hands control of a mutable split to another address, or locks it
    /// forever when the new controller is None.
    pub fn transfer_control(
        env: Env,
        id: u64,
        new_controller: Option<Address>,
    ) -> Result<(), Error> {
        let mut split = load(&env, id)?;
        let controller = split.controller.clone().ok_or(Error::SplitImmutable)?;
        controller.require_auth();
        split.controller = new_controller.clone();
        env.storage().persistent().set(&DataKey::Split(id), &split);
        ControlTransferred { id, new_controller }.publish(&env);
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
        let split = load(&env, id)?;
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
            if let Some(idx) = tokens.first_index_of(&token) {
                tokens.remove(idx);
                if tokens.is_empty() {
                    env.storage().persistent().remove(&tokens_key);
                } else {
                    env.storage().persistent().set(&tokens_key, &tokens);
                    env.storage().persistent().extend_ttl(
                        &tokens_key,
                        TTL_THRESHOLD,
                        TTL_EXTEND_TO,
                    );
                }
            }
        }

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

    /// Returns the exact per-recipient amounts a payment of `amount` would
    /// produce, without moving any funds.
    pub fn preview_payout(env: Env, id: u64, amount: i128) -> Result<Vec<i128>, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let split = load(&env, id)?;
        amounts(&env, &split, amount)
    }

    pub fn balance(env: Env, id: u64, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id, token))
            .unwrap_or(0)
    }

    pub fn get_split(env: Env, id: u64) -> Result<Split, Error> {
        load(&env, id)
    }

    pub fn held_tokens(env: Env, id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::HeldTokens(id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn splits_of(env: Env, creator: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::Created(creator))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn splits_of_paged(env: Env, creator: Address, start: u32, limit: u32) -> Vec<u64> {
        let all: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::Created(creator))
            .unwrap_or_else(|| Vec::new(&env));
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

    pub fn splits_of_count(env: Env, creator: Address) -> u32 {
        let all: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::Created(creator))
            .unwrap_or_else(|| Vec::new(&env));
        all.len()
    }

    pub fn split_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
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
    let mut total: u32 = 0;
    for share in shares.iter() {
        if share == 0 {
            return Err(Error::ZeroShare);
        }
        total = total.checked_add(share).ok_or(Error::BadShareTotal)?;
    }
    if total != TOTAL_SHARES {
        return Err(Error::BadShareTotal);
    }
    Ok(())
}

fn amounts(env: &Env, split: &Split, amount: i128) -> Result<Vec<i128>, Error> {
    let mut out = Vec::new(env);
    let last = split.recipients.len() - 1;
    let mut assigned: i128 = 0;
    let total = I256::from_i128(env, TOTAL_SHARES as i128);
    for i in 0..split.recipients.len() {
        let part = if i == last {
            amount - assigned
        } else {
            // `amount * share` can overflow i128 for large token amounts
            // (custom high-supply tokens) before the division brings it back
            // into range. Compute the intermediate in 256-bit space so any
            // valid i128 amount stays panic- and wrap-free.
            let product = I256::from_i128(env, amount)
                .mul(&I256::from_i128(env, split.shares.get_unchecked(i) as i128));
            let part_i256 = product.div(&total);
            part_i256.to_i128().ok_or(Error::ArithmeticOverflow)?
        };
        out.push_back(part);
        assigned += part;
    }
    Ok(out)
}

fn payout(env: &Env, split: &Split, from: &Address, token: &Address, amount: i128) {
    let client = token::Client::new(env, token);
    let vault = env.current_contract_address();
    let parts = amounts(env, split, amount).unwrap_or_else(|_| Vec::new(env));
    for i in 0..split.recipients.len() {
        let part = parts.get_unchecked(i);
        if part <= 0 {
            continue;
        }
        match split.recipients.get_unchecked(i) {
            Recipient::Account(addr) => client.transfer(from, &addr, &part),
            Recipient::Split(child) => {
                if from != &vault {
                    client.transfer(from, &vault, &part);
                }
                credit(env, child, token, part);
            }
        }
    }
}

fn credit(env: &Env, id: u64, token: &Address, amount: i128) {
    let key = DataKey::Balance(id, token.clone());
    let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(held + amount));

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

#[cfg(test)]
mod test;
