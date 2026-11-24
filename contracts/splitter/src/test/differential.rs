use super::*;
use alloc::collections::BTreeMap;
use alloc::vec;
use proptest::prelude::*;

const ACCOUNT_POOL: usize = 6;
const CREATOR_POOL: usize = 3;
const TOKEN_POOL: usize = 2;
const INITIAL_PAYER_BALANCE: i128 = 1_000_000_000;

#[derive(Clone, Debug, Eq, PartialEq)]
enum Operation {
    Create {
        creator: u8,
        mutable: bool,
        recipients: alloc::vec::Vec<RecipientSpec>,
        weights: alloc::vec::Vec<u16>,
    },
    Update {
        id_hint: u8,
        recipients: alloc::vec::Vec<RecipientSpec>,
        weights: alloc::vec::Vec<u16>,
    },
    Deposit {
        id_hint: u8,
        token: u8,
        amount: i128,
    },
    Pay {
        id_hint: u8,
        token: u8,
        amount: i128,
    },
    Distribute {
        id_hint: u8,
        token: u8,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum RecipientSpec {
    Account(u8),
    SplitRef(u8),
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ModelRecipient {
    Account(usize),
    Split(u64),
}

#[derive(Clone, Debug)]
struct ModelSplit {
    recipients: alloc::vec::Vec<ModelRecipient>,
    shares: alloc::vec::Vec<u32>,
    controller: Option<usize>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DustRule {
    LastRecipient,
    FirstRecipient,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ModelError {
    NoRecipients,
    LengthMismatch,
    ZeroShare,
    BadShareTotal,
    SplitNotFound,
    SplitImmutable,
    InvalidAmount,
    NothingToDistribute,
    TooManyRecipients,
    BadChildSplit,
    SplitHasBalance,
}

impl ModelError {
    fn to_contract_error(self) -> Error {
        match self {
            Self::NoRecipients => Error::NoRecipients,
            Self::LengthMismatch => Error::LengthMismatch,
            Self::ZeroShare => Error::ZeroShare,
            Self::BadShareTotal => Error::BadShareTotal,
            Self::SplitNotFound => Error::SplitNotFound,
            Self::SplitImmutable => Error::SplitImmutable,
            Self::InvalidAmount => Error::InvalidAmount,
            Self::NothingToDistribute => Error::NothingToDistribute,
            Self::TooManyRecipients => Error::TooManyRecipients,
            Self::BadChildSplit => Error::BadChildSplit,
            Self::SplitHasBalance => Error::SplitHasBalance,
        }
    }
}

struct ReferenceModel {
    splits: alloc::vec::Vec<ModelSplit>,
    balances: BTreeMap<(u64, usize), i128>,
    account_balances: BTreeMap<(usize, usize), i128>,
    created: alloc::vec::Vec<alloc::vec::Vec<u64>>,
    dust_rule: DustRule,
}

impl ReferenceModel {
    fn new(dust_rule: DustRule) -> Self {
        Self {
            splits: vec![],
            balances: BTreeMap::new(),
            account_balances: BTreeMap::new(),
            created: vec![vec![]; CREATOR_POOL],
            dust_rule,
        }
    }

    fn split_count(&self) -> u64 {
        self.splits.len() as u64
    }

    fn split(&self, id: u64) -> Result<&ModelSplit, ModelError> {
        self.splits.get(id as usize).ok_or(ModelError::SplitNotFound)
    }

    fn balance(&self, id: u64, token: usize) -> i128 {
        *self.balances.get(&(id, token)).unwrap_or(&0)
    }

    fn account_balance(&self, account: usize, token: usize) -> i128 {
        *self.account_balances.get(&(account, token)).unwrap_or(&0)
    }

    fn has_any_balance(&self, id: u64) -> bool {
        self.balances
            .iter()
            .any(|(&(sid, _), &amount)| sid == id && amount > 0)
    }

    fn credit_split(&mut self, id: u64, token: usize, amount: i128) {
        let entry = self.balances.entry((id, token)).or_insert(0);
        *entry += amount;
    }

    fn credit_account(&mut self, account: usize, token: usize, amount: i128) {
        let entry = self.account_balances.entry((account, token)).or_insert(0);
        *entry += amount;
    }

    fn amounts(&self, shares: &[u32], amount: i128) -> alloc::vec::Vec<i128> {
        let mut out = vec![0; shares.len()];
        let mut assigned = 0i128;
        for (i, share) in shares.iter().enumerate() {
            let is_dust_recipient = match self.dust_rule {
                DustRule::LastRecipient => i + 1 == shares.len(),
                DustRule::FirstRecipient => i == 0,
            };
            let part = if is_dust_recipient {
                amount - assigned
            } else {
                amount * i128::from(*share) / i128::from(TOTAL_SHARES)
            };
            out[i] = part;
            assigned += part;
        }
        out
    }

    fn validate(
        &self,
        own_id: u64,
        recipients: &[ModelRecipient],
        shares: &[u32],
    ) -> Result<(), ModelError> {
        if recipients.is_empty() {
            return Err(ModelError::NoRecipients);
        }
        if recipients.len() > MAX_RECIPIENTS as usize {
            return Err(ModelError::TooManyRecipients);
        }
        if recipients.len() != shares.len() {
            return Err(ModelError::LengthMismatch);
        }
        let mut total = 0u32;
        for recipient in recipients {
            if let ModelRecipient::Split(child) = recipient {
                if *child == own_id || (*child as usize) >= self.splits.len() {
                    return Err(ModelError::BadChildSplit);
                }
            }
        }
        for share in shares {
            if *share == 0 {
                return Err(ModelError::ZeroShare);
            }
            total = total.checked_add(*share).ok_or(ModelError::BadShareTotal)?;
        }
        if total != TOTAL_SHARES {
            return Err(ModelError::BadShareTotal);
        }
        Ok(())
    }

    fn create_split(
        &mut self,
        creator: usize,
        recipients: alloc::vec::Vec<ModelRecipient>,
        shares: alloc::vec::Vec<u32>,
        controller: Option<usize>,
    ) -> Result<u64, ModelError> {
        let id = self.split_count();
        self.validate(id, &recipients, &shares)?;
        self.splits.push(ModelSplit {
            recipients,
            shares,
            controller,
        });
        self.created[creator].push(id);
        Ok(id)
    }

    fn update_split(
        &mut self,
        id: u64,
        recipients: alloc::vec::Vec<ModelRecipient>,
        shares: alloc::vec::Vec<u32>,
    ) -> Result<(), ModelError> {
        let idx = id as usize;
        let split = self.splits.get(idx).ok_or(ModelError::SplitNotFound)?;
        if split.controller.is_none() {
            return Err(ModelError::SplitImmutable);
        }
        if self.has_any_balance(id) {
            return Err(ModelError::SplitHasBalance);
        }
        self.validate(id, &recipients, &shares)?;
        let split = self.splits.get_mut(idx).ok_or(ModelError::SplitNotFound)?;
        split.recipients = recipients;
        split.shares = shares;
        Ok(())
    }

    fn payout_recipients(
        &mut self,
        recipients: &[ModelRecipient],
        shares: &[u32],
        token: usize,
        amount: i128,
    ) {
        let parts = self.amounts(shares, amount);
        for (recipient, part) in recipients.iter().zip(parts.into_iter()) {
            if part <= 0 {
                continue;
            }
            match recipient {
                ModelRecipient::Account(account) => self.credit_account(*account, token, part),
                ModelRecipient::Split(split_id) => self.credit_split(*split_id, token, part),
            }
        }
    }

    fn pay(&mut self, id: u64, token: usize, amount: i128) -> Result<(), ModelError> {
        if amount <= 0 {
            return Err(ModelError::InvalidAmount);
        }
        let split = self.split(id)?.clone();
        self.payout_recipients(&split.recipients, &split.shares, token, amount);
        Ok(())
    }

    fn deposit(&mut self, id: u64, token: usize, amount: i128) -> Result<(), ModelError> {
        if amount <= 0 {
            return Err(ModelError::InvalidAmount);
        }
        self.split(id)?;
        self.credit_split(id, token, amount);
        Ok(())
    }

    fn distribute(&mut self, id: u64, token: usize) -> Result<i128, ModelError> {
        self.split(id)?;
        let amount = self.balance(id, token);
        if amount <= 0 {
            return Err(ModelError::NothingToDistribute);
        }
        self.balances.remove(&(id, token));
        let split = self.split(id)?.clone();
        self.payout_recipients(&split.recipients, &split.shares, token, amount);
        Ok(amount)
    }
}

struct TokenHarness {
    id: Address,
    client: token::Client<'static>,
    payer: Address,
}

struct DifferentialHarness {
    setup: Setup,
    model: ReferenceModel,
    creators: alloc::vec::Vec<Address>,
    accounts: alloc::vec::Vec<Address>,
    tokens: alloc::vec::Vec<TokenHarness>,
}

impl DifferentialHarness {
    fn new(dust_rule: DustRule) -> Self {
        let setup = setup();

        let creators = (0..CREATOR_POOL)
            .map(|_| Address::generate(&setup.env))
            .collect::<alloc::vec::Vec<_>>();
        let accounts = (0..ACCOUNT_POOL)
            .map(|_| Address::generate(&setup.env))
            .collect::<alloc::vec::Vec<_>>();

        let mut tokens = vec![];
        for _ in 0..TOKEN_POOL {
            let payer = Address::generate(&setup.env);
            let (id, client) = fund_token(&setup.env, &payer, INITIAL_PAYER_BALANCE);
            tokens.push(TokenHarness { id, client, payer });
        }

        Self {
            setup,
            model: ReferenceModel::new(dust_rule),
            creators,
            accounts,
            tokens,
        }
    }

    fn resolve_recipients(
        &self,
        specs: &[RecipientSpec],
    ) -> (alloc::vec::Vec<ModelRecipient>, soroban_sdk::Vec<Recipient>) {
        let mut model = vec![];
        let mut contract = vec![&self.setup.env];
        let split_count = self.model.split_count();

        for spec in specs {
            match spec {
                RecipientSpec::Account(idx) => {
                    let account_idx = usize::from(*idx) % self.accounts.len();
                    model.push(ModelRecipient::Account(account_idx));
                    contract.push_back(acct(&self.accounts[account_idx]));
                }
                RecipientSpec::SplitRef(idx) if split_count > 0 => {
                    let id = u64::from(*idx) % split_count;
                    model.push(ModelRecipient::Split(id));
                    contract.push_back(Recipient::Split(id));
                }
                RecipientSpec::SplitRef(_) => {
                    model.push(ModelRecipient::Account(0));
                    contract.push_back(acct(&self.accounts[0]));
                }
            }
        }

        (model, contract)
    }

    fn apply(&mut self, op: Operation) {
        match op {
            Operation::Create {
                creator,
                mutable,
                recipients,
                weights,
            } => self.apply_create(creator, mutable, recipients, weights),
            Operation::Update {
                id_hint,
                recipients,
                weights,
            } => self.apply_update(id_hint, recipients, weights),
            Operation::Deposit {
                id_hint,
                token,
                amount,
            } => self.apply_deposit(id_hint, token, amount),
            Operation::Pay {
                id_hint,
                token,
                amount,
            } => self.apply_pay(id_hint, token, amount),
            Operation::Distribute { id_hint, token } => self.apply_distribute(id_hint, token),
        }
    }

    fn apply_create(
        &mut self,
        creator_hint: u8,
        mutable: bool,
        recipient_specs: alloc::vec::Vec<RecipientSpec>,
        weights: alloc::vec::Vec<u16>,
    ) {
        let creator_idx = usize::from(creator_hint) % self.creators.len();
        let (model_recipients, contract_recipients) = self.resolve_recipients(&recipient_specs);
        let shares = normalize_weights_to_shares(&weights);
        let mut contract_shares = vec![&self.setup.env];
        for share in &shares {
            contract_shares.push_back(*share);
        }
        let controller = if mutable {
            Some(self.creators[creator_idx].clone())
        } else {
            None
        };

        let model = self.model.create_split(
            creator_idx,
            model_recipients,
            shares,
            mutable.then_some(creator_idx),
        );
        let contract = self.setup.client.try_create_split(
            &self.creators[creator_idx],
            &contract_recipients,
            &contract_shares,
            &controller,
        );

        match (model, decode_result(contract)) {
            (Ok(model_id), Ok(contract_id)) => assert_eq!(model_id, contract_id),
            (Err(model_err), Err(contract_err)) => {
                assert_eq!(model_err.to_contract_error(), contract_err)
            }
            mismatch => panic!("create mismatch: {mismatch:?}"),
        }
    }

    fn apply_update(
        &mut self,
        id_hint: u8,
        recipient_specs: alloc::vec::Vec<RecipientSpec>,
        weights: alloc::vec::Vec<u16>,
    ) {
        let target = resolve_id_hint(self.model.split_count(), id_hint);
        let (model_recipients, contract_recipients) = self.resolve_recipients(&recipient_specs);
        let shares = normalize_weights_to_shares(&weights);
        let mut contract_shares = vec![&self.setup.env];
        for share in &shares {
            contract_shares.push_back(*share);
        }

        let model = self
            .model
            .update_split(target, model_recipients, shares)
            .map(|_| ());
        let contract = decode_result(
            self.setup
                .client
                .try_update_split(&target, &contract_recipients, &contract_shares),
        )
        .map(|_| ());

        assert_model_and_contract_result(model, contract, "update");
    }

    fn apply_deposit(&mut self, id_hint: u8, token_hint: u8, amount: i128) {
        let split_id = resolve_id_hint(self.model.split_count(), id_hint);
        let token = usize::from(token_hint) % self.tokens.len();

        let model = self.model.deposit(split_id, token, amount);
        let contract = decode_result(self.setup.client.try_deposit(
            &self.tokens[token].payer,
            &split_id,
            &self.tokens[token].id,
            &amount,
        ))
        .map(|_| ());

        assert_model_and_contract_result(model, contract, "deposit");
    }

    fn apply_pay(&mut self, id_hint: u8, token_hint: u8, amount: i128) {
        let split_id = resolve_id_hint(self.model.split_count(), id_hint);
        let token = usize::from(token_hint) % self.tokens.len();

        let model = self.model.pay(split_id, token, amount);
        let contract = decode_result(self.setup.client.try_pay(
            &self.tokens[token].payer,
            &split_id,
            &self.tokens[token].id,
            &amount,
        ))
        .map(|_| ());

        assert_model_and_contract_result(model, contract, "pay");
    }

    fn apply_distribute(&mut self, id_hint: u8, token_hint: u8) {
        let split_id = resolve_id_hint(self.model.split_count(), id_hint);
        let token = usize::from(token_hint) % self.tokens.len();

        let model = self.model.distribute(split_id, token);
        let contract = decode_result(
            self.setup
                .client
                .try_distribute(&split_id, &self.tokens[token].id),
        );

        assert_model_and_contract_result(model, contract, "distribute");
    }

    fn assert_equivalent_observable_state(&self) {
        assert_eq!(self.setup.client.split_count(), self.model.split_count());

        for id in 0..self.model.split_count() {
            let contract_split = self.setup.client.get_split(&id);
            let model_split = self.model.split(id).expect("model split exists");

            let mut expected_recipients = vec![&self.setup.env];
            for recipient in &model_split.recipients {
                match recipient {
                    ModelRecipient::Account(idx) => {
                        expected_recipients.push_back(acct(&self.accounts[*idx]));
                    }
                    ModelRecipient::Split(split_id) => {
                        expected_recipients.push_back(Recipient::Split(*split_id));
                    }
                }
            }
            let mut expected_shares = vec![&self.setup.env];
            for share in &model_split.shares {
                expected_shares.push_back(*share);
            }
            let expected_controller = model_split.controller.map(|idx| self.creators[idx].clone());

            assert_eq!(
                contract_split,
                Split {
                    recipients: expected_recipients,
                    shares: expected_shares,
                    controller: expected_controller,
                },
                "split mismatch for id {id}"
            );
        }

        for creator_idx in 0..self.creators.len() {
            let contract_ids = self.setup.client.splits_of(&self.creators[creator_idx]);
            let expected_ids = soroban_sdk::Vec::from_slice(&self.setup.env, &self.model.created[creator_idx]);
            assert_eq!(contract_ids, expected_ids, "splits_of mismatch for creator {creator_idx}");
        }

        for id in 0..self.model.split_count() {
            for token_idx in 0..self.tokens.len() {
                assert_eq!(
                    self.setup.client.balance(&id, &self.tokens[token_idx].id),
                    self.model.balance(id, token_idx),
                    "balance mismatch for split {id} token {token_idx}"
                );
            }
        }

        for account_idx in 0..self.accounts.len() {
            for token_idx in 0..self.tokens.len() {
                assert_eq!(
                    self.tokens[token_idx].client.balance(&self.accounts[account_idx]),
                    self.model.account_balance(account_idx, token_idx),
                    "recipient token balance mismatch for account {account_idx} token {token_idx}"
                );
            }
        }
    }
}

fn resolve_id_hint(split_count: u64, hint: u8) -> u64 {
    if split_count == 0 {
        0
    } else {
        u64::from(hint) % split_count
    }
}

fn normalize_weights_to_shares(weights: &[u16]) -> alloc::vec::Vec<u32> {
    let len = weights.len().max(1);
    let mut normalized = vec![1u32; len];
    let total: u64 = weights.iter().map(|w| u64::from((*w).max(1))).sum();
    let mut assigned: u32 = 0;

    for i in 0..len {
        let is_last = i + 1 == len;
        let share = if is_last {
            TOTAL_SHARES - assigned
        } else {
            let weight = u64::from(*weights.get(i).unwrap_or(&1)).max(1);
            let computed = ((weight * u64::from(TOTAL_SHARES)) / total) as u32;
            computed.max(1)
        };
        normalized[i] = share;
        assigned = assigned.saturating_add(share);
    }

    if assigned != TOTAL_SHARES {
        *normalized.last_mut().expect("at least one share") += TOTAL_SHARES - assigned;
    }

    normalized
}

fn decode_result<T>(result: Result<T, Result<Error, impl core::fmt::Debug>>) -> Result<T, Error> {
    match result {
        Ok(value) => Ok(value),
        Err(Ok(error)) => Err(error),
        Err(Err(host_error)) => panic!("unexpected host error: {host_error:?}"),
    }
}

fn assert_model_and_contract_result<T>(
    model: Result<T, ModelError>,
    contract: Result<T, Error>,
    op: &str,
) where
    T: core::fmt::Debug + PartialEq,
{
    match (model, contract) {
        (Ok(model_value), Ok(contract_value)) => assert_eq!(model_value, contract_value),
        (Err(model_err), Err(contract_err)) => assert_eq!(model_err.to_contract_error(), contract_err),
        mismatch => panic!("{op} mismatch: {mismatch:?}"),
    }
}

fn arb_recipient_spec() -> impl Strategy<Value = RecipientSpec> {
    prop_oneof![
        any::<u8>().prop_map(RecipientSpec::Account),
        any::<u8>().prop_map(RecipientSpec::SplitRef),
    ]
}

fn arb_operation() -> impl Strategy<Value = Operation> {
    let recipients = prop::collection::vec(arb_recipient_spec(), 1..=4);
    let weights = prop::collection::vec(1u16..=5000u16, 1..=4);

    prop_oneof![
        (any::<u8>(), any::<bool>(), recipients.clone(), weights.clone())
            .prop_map(|(creator, mutable, recipients, weights)| Operation::Create {
                creator,
                mutable,
                recipients,
                weights,
            }),
        (any::<u8>(), recipients.clone(), weights.clone()).prop_map(
            |(id_hint, recipients, weights)| Operation::Update {
                id_hint,
                recipients,
                weights,
            }
        ),
        (any::<u8>(), any::<u8>(), 1i128..50_000i128)
            .prop_map(|(id_hint, token, amount)| Operation::Deposit {
                id_hint,
                token,
                amount,
            }),
        (any::<u8>(), any::<u8>(), 1i128..50_000i128).prop_map(|(id_hint, token, amount)| {
            Operation::Pay {
                id_hint,
                token,
                amount,
            }
        }),
        (any::<u8>(), any::<u8>())
            .prop_map(|(id_hint, token)| Operation::Distribute { id_hint, token }),
    ]
}

fn minimize_sequence(
    mut sequence: alloc::vec::Vec<Operation>,
    mut still_fails: impl FnMut(&[Operation]) -> bool,
) -> alloc::vec::Vec<Operation> {
    let mut i = 0;
    while i < sequence.len() {
        let mut candidate = sequence.clone();
        candidate.remove(i);
        if !candidate.is_empty() && still_fails(&candidate) {
            sequence = candidate;
            i = 0;
        } else {
            i += 1;
        }
    }
    sequence
}

fn has_divergence(sequence: &[Operation], dust_rule: DustRule) -> bool {
    let mut harness = DifferentialHarness::new(dust_rule);
    for op in sequence.iter().cloned() {
        harness.apply(op);
        if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            harness.assert_equivalent_observable_state();
        }))
        .is_err()
        {
            return true;
        }
    }
    false
}

proptest! {
    #[test]
    fn differential_model_matches_contract(ops in prop::collection::vec(arb_operation(), 1..64)) {
        let mut harness = DifferentialHarness::new(DustRule::LastRecipient);
        for op in ops {
            harness.apply(op);
            harness.assert_equivalent_observable_state();
        }
    }
}

#[test]
fn differential_harness_detects_and_minimizes_seeded_bug() {
    let noisy_sequence = vec![
        Operation::Deposit {
            id_hint: 42,
            token: 0,
            amount: 100,
        },
        Operation::Create {
            creator: 0,
            mutable: false,
            recipients: vec![RecipientSpec::Account(0), RecipientSpec::Account(1)],
            weights: vec![1, 1],
        },
        Operation::Pay {
            id_hint: 0,
            token: 0,
            amount: 1,
        },
        Operation::Distribute {
            id_hint: 0,
            token: 0,
        },
    ];

    assert!(
        has_divergence(&noisy_sequence, DustRule::FirstRecipient),
        "injected bug should be detected"
    );

    let minimized = minimize_sequence(noisy_sequence.clone(), |candidate| {
        has_divergence(candidate, DustRule::FirstRecipient)
    });

    assert!(minimized.len() < noisy_sequence.len());
    assert!(has_divergence(&minimized, DustRule::FirstRecipient));
    assert_eq!(
        minimized,
        vec![
            Operation::Create {
                creator: 0,
                mutable: false,
                recipients: vec![RecipientSpec::Account(0), RecipientSpec::Account(1)],
                weights: vec![1, 1],
            },
            Operation::Pay {
                id_hint: 0,
                token: 0,
                amount: 1,
            },
        ]
    );
}
