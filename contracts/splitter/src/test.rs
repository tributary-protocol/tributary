#![cfg(test)]
extern crate alloc;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec, Env, IntoVal};

struct Setup {
    env: Env,
    client: SplitterClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Splitter, ());
    let client = SplitterClient::new(&env, &contract_id);
    Setup { env, client }
}

fn fund_token(env: &Env, payer: &Address, amount: i128) -> (Address, token::Client<'static>) {
    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token_id = sac.address();
    token::StellarAssetClient::new(env, &token_id).mint(payer, &amount);
    (token_id.clone(), token::Client::new(env, &token_id))
}

fn acct(a: &Address) -> Recipient {
    Recipient::Account(a.clone())
}

#[test]
fn create_and_get() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 6_000, 4_000],
        &None,
    );

    assert_eq!(id, 0);
    assert_eq!(s.client.split_count(), 1);

    let split = s.client.get_split(&id);
    assert_eq!(split.recipients, vec![&s.env, acct(&a), acct(&b)]);
    assert_eq!(split.shares, vec![&s.env, 6_000, 4_000]);
    assert_eq!(split.controller, None);
}

#[test]
fn rejects_invalid_splits() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);

    let no_recipients = s
        .client
        .try_create_split(&creator, &vec![&s.env], &vec![&s.env], &None);
    assert_eq!(no_recipients, Err(Ok(Error::NoRecipients)));

    let mismatch = s.client.try_create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 10_000],
        &None,
    );
    assert_eq!(mismatch, Err(Ok(Error::LengthMismatch)));

    let zero_share = s.client.try_create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 10_000, 0],
        &None,
    );
    assert_eq!(zero_share, Err(Ok(Error::ZeroShare)));

    let bad_total = s.client.try_create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 5_000, 4_000],
        &None,
    );
    assert_eq!(bad_total, Err(Ok(Error::BadShareTotal)));
}

#[test]
fn tracks_splits_by_creator() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let other = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    s.client.create_split(
        &other,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    assert_eq!(s.client.splits_of(&creator), vec![&s.env, 0, 2]);
    assert_eq!(s.client.splits_of(&other), vec![&s.env, 1]);
    let stranger = Address::generate(&s.env);
    assert_eq!(s.client.splits_of(&stranger), vec![&s.env]);
}

#[test]
fn rejects_too_many_recipients() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let mut recipients = vec![&s.env];
    let mut shares = vec![&s.env];
    for _ in 0..33 {
        recipients.push_back(acct(&Address::generate(&s.env)));
        shares.push_back(300u32);
    }

    let result = s
        .client
        .try_create_split(&creator, &recipients, &shares, &None);
    assert_eq!(result, Err(Ok(Error::TooManyRecipients)));
}

#[test]
fn pay_distributes_by_shares() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let c = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 1_000_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b), acct(&c)],
        &vec![&s.env, 5_000, 3_000, 2_000],
        &None,
    );

    s.client.pay(&payer, &id, &token_id, &100_000);

    assert_eq!(token_client.balance(&a), 50_000);
    assert_eq!(token_client.balance(&b), 30_000);
    assert_eq!(token_client.balance(&c), 20_000);
    assert_eq!(token_client.balance(&payer), 900_000);
}

#[test]
fn rounding_dust_goes_to_last_recipient() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let c = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 100);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b), acct(&c)],
        &vec![&s.env, 3_333, 3_333, 3_334],
        &None,
    );

    s.client.pay(&payer, &id, &token_id, &100);

    assert_eq!(token_client.balance(&a), 33);
    assert_eq!(token_client.balance(&b), 33);
    assert_eq!(token_client.balance(&c), 34);
    assert_eq!(token_client.balance(&payer), 0);
}

#[test]
fn preview_matches_actual_payout() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let c = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b), acct(&c)],
        &vec![&s.env, 3_333, 3_333, 3_334],
        &None,
    );

    let preview = s.client.preview_payout(&id, &1_000);
    assert_eq!(preview, vec![&s.env, 333, 333, 334]);

    s.client.pay(&payer, &id, &token_id, &1_000);
    assert_eq!(token_client.balance(&a), preview.get_unchecked(0));
    assert_eq!(token_client.balance(&b), preview.get_unchecked(1));
    assert_eq!(token_client.balance(&c), preview.get_unchecked(2));
}

#[test]
fn rejects_non_positive_amounts() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let zero = s.client.try_pay(&payer, &id, &token_id, &0);
    assert_eq!(zero, Err(Ok(Error::InvalidAmount)));

    let negative = s.client.try_pay(&payer, &id, &token_id, &-5);
    assert_eq!(negative, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn pay_many_settles_several_splits_at_once() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 10_000);

    let first = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    let second = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 5_000, 5_000],
        &None,
    );

    s.client.pay_many(
        &payer,
        &vec![&s.env, first, second],
        &vec![&s.env, 1_000, 2_000],
        &token_id,
    );

    assert_eq!(token_client.balance(&a), 2_000);
    assert_eq!(token_client.balance(&b), 1_000);
    assert_eq!(token_client.balance(&payer), 7_000);
}

#[test]
fn pay_many_rejects_bad_batches() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 10_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let empty = s
        .client
        .try_pay_many(&payer, &vec![&s.env], &vec![&s.env], &token_id);
    assert_eq!(empty, Err(Ok(Error::NoRecipients)));

    let mismatch = s.client.try_pay_many(
        &payer,
        &vec![&s.env, id],
        &vec![&s.env, 100, 200],
        &token_id,
    );
    assert_eq!(mismatch, Err(Ok(Error::LengthMismatch)));

    let unknown = s.client.try_pay_many(
        &payer,
        &vec![&s.env, id, 99],
        &vec![&s.env, 100, 200],
        &token_id,
    );
    assert_eq!(unknown, Err(Ok(Error::SplitNotFound)));
    assert_eq!(token_client.balance(&a), 0);
}

#[test]
fn pay_requires_the_payers_authorization() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let intruder = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    s.env.set_auths(&[]);
    let result = s.env.try_invoke_contract::<(), Error>(
        &s.client.address,
        &soroban_sdk::symbol_short!("pay"),
        (&intruder, id, &token_id, 100i128).into_val(&s.env),
    );
    assert!(result.is_err());
}

#[test]
fn conservation_holds_across_share_mixes() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 100_000);

    let cases = [
        (vec![&s.env, 9_999u32, 1u32], 777i128),
        (vec![&s.env, 5_000u32, 4_999u32, 1u32], 1_003i128),
        (vec![&s.env, 1_000u32, 2_000u32, 3_000u32, 4_000u32], 99i128),
    ];

    for (shares, amount) in cases {
        let mut addrs: soroban_sdk::Vec<Address> = vec![&s.env];
        let mut recipients = vec![&s.env];
        for _ in 0..shares.len() {
            let addr = Address::generate(&s.env);
            recipients.push_back(acct(&addr));
            addrs.push_back(addr);
        }
        let id = s.client.create_split(&creator, &recipients, &shares, &None);
        s.client.pay(&payer, &id, &token_id, &amount);

        let mut received: i128 = 0;
        for addr in addrs.iter() {
            received += token_client.balance(&addr);
        }
        assert_eq!(received, amount);
    }
}

#[test]
fn nested_portions_credit_the_child_split() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let leaf_a = Address::generate(&s.env);
    let leaf_b = Address::generate(&s.env);
    let direct = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 10_000);

    let child = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&leaf_a), acct(&leaf_b)],
        &vec![&s.env, 5_000, 5_000],
        &None,
    );
    let parent = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&direct), Recipient::Split(child)],
        &vec![&s.env, 6_000, 4_000],
        &None,
    );

    s.client.pay(&payer, &parent, &token_id, &1_000);

    assert_eq!(token_client.balance(&direct), 600);
    assert_eq!(s.client.balance(&child, &token_id), 400);
    assert_eq!(token_client.balance(&s.client.address), 400);

    s.client.distribute(&child, &token_id);
    assert_eq!(token_client.balance(&leaf_a), 200);
    assert_eq!(token_client.balance(&leaf_b), 200);
    assert_eq!(token_client.balance(&s.client.address), 0);
}

#[test]
fn rejects_missing_or_self_referencing_children() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    let unknown_child = s.client.try_create_split(
        &creator,
        &vec![&s.env, acct(&a), Recipient::Split(7)],
        &vec![&s.env, 5_000, 5_000],
        &None,
    );
    assert_eq!(unknown_child, Err(Ok(Error::BadChildSplit)));

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller),
    );

    let self_reference = s.client.try_update_split(
        &id,
        &vec![&s.env, acct(&a), Recipient::Split(id)],
        &vec![&s.env, 5_000, 5_000],
    );
    assert_eq!(self_reference, Err(Ok(Error::BadChildSplit)));
}

#[test]
fn pay_unknown_split_fails() {
    let s = setup();
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let result = s.client.try_pay(&payer, &99, &token_id, &100);
    assert_eq!(result, Err(Ok(Error::SplitNotFound)));
}

#[test]
fn deposit_credits_split_balance() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    s.client.deposit(&payer, &id, &token_id, &400);

    assert_eq!(s.client.balance(&id, &token_id), 400);
    assert_eq!(token_client.balance(&s.client.address), 400);
    assert_eq!(token_client.balance(&payer), 600);
}

#[test]
fn distribute_pays_recipients_and_clears_balance() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 7_500, 2_500],
        &None,
    );

    s.client.deposit(&payer, &id, &token_id, &600);
    s.client.deposit(&payer, &id, &token_id, &400);
    let distributed = s.client.distribute(&id, &token_id);

    assert_eq!(distributed, 1_000);
    assert_eq!(token_client.balance(&a), 750);
    assert_eq!(token_client.balance(&b), 250);
    assert_eq!(token_client.balance(&s.client.address), 0);
    assert_eq!(s.client.balance(&id, &token_id), 0);
}

#[test]
fn balances_per_token_stay_independent() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_x, _) = fund_token(&s.env, &payer, 1_000);
    let (token_y, client_y) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    s.client.deposit(&payer, &id, &token_x, &300);
    s.client.deposit(&payer, &id, &token_y, &700);

    assert_eq!(s.client.balance(&id, &token_x), 300);
    assert_eq!(s.client.balance(&id, &token_y), 700);

    s.client.distribute(&id, &token_y);
    assert_eq!(s.client.balance(&id, &token_x), 300);
    assert_eq!(s.client.balance(&id, &token_y), 0);
    assert_eq!(client_y.balance(&a), 700);
}

#[test]
fn distribute_with_empty_balance_fails() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let result = s.client.try_distribute(&id, &token_id);
    assert_eq!(result, Err(Ok(Error::NothingToDistribute)));
}

#[test]
fn deposit_to_unknown_split_fails() {
    let s = setup();
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let result = s.client.try_deposit(&payer, &42, &token_id, &100);
    assert_eq!(result, Err(Ok(Error::SplitNotFound)));
}

#[test]
fn control_can_be_transferred_and_renounced() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let next = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );

    s.client.transfer_control(&id, &Some(next.clone()));
    assert_eq!(s.client.get_split(&id).controller, Some(next));

    s.client.transfer_control(&id, &None);
    assert_eq!(s.client.get_split(&id).controller, None);

    let update = s
        .client
        .try_update_split(&id, &vec![&s.env, acct(&a)], &vec![&s.env, 10_000]);
    assert_eq!(update, Err(Ok(Error::SplitImmutable)));

    let transfer = s.client.try_transfer_control(&id, &None);
    assert_eq!(transfer, Err(Ok(Error::SplitImmutable)));
}

#[test]
fn controller_can_update_mutable_split() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );

    s.client.update_split(
        &id,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 7_000, 3_000],
    );

    let split = s.client.get_split(&id);
    assert_eq!(split.recipients, vec![&s.env, acct(&a), acct(&b)]);
    assert_eq!(split.shares, vec![&s.env, 7_000, 3_000]);
}

#[test]
fn immutable_split_cannot_be_updated() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let result = s
        .client
        .try_update_split(&id, &vec![&s.env, acct(&b)], &vec![&s.env, 10_000]);
    assert_eq!(result, Err(Ok(Error::SplitImmutable)));
}

#[test]
fn property_conservation_random_shares() {
    assert!(proptest::test_runner::TestRunner::default()
        .run(
            &(
                proptest::collection::vec(1u32..=10_000u32, 2..10usize),
                1i128..1_000_000i128,
            ),
            |(shares, amount)| {
                // Setup environment
                let env = soroban_sdk::Env::default();
                env.mock_all_auths();
                let contract_id = env.register(Splitter, ());
                let client = SplitterClient::new(&env, &contract_id);
                let creator = soroban_sdk::Address::generate(&env);

                // Normalize shares to sum to exactly 10_000
                let sum: u32 = shares.iter().sum();
                let mut normalized_shares = alloc::vec::Vec::new();
                let mut current_sum = 0;
                for share in shares.iter().take(shares.len() - 1) {
                    let normalized = ((*share as u64 * 10_000) / sum as u64) as u32;
                    let normalized = normalized.max(1);
                    normalized_shares.push(normalized);
                    current_sum += normalized;
                }
                if current_sum >= 10_000 {
                    return Err(proptest::test_runner::TestCaseError::reject(
                        "shares sum exceeded total",
                    ));
                }
                let last_share = 10_000 - current_sum;
                if last_share == 0 {
                    return Err(proptest::test_runner::TestCaseError::reject(
                        "last share is zero",
                    ));
                }
                normalized_shares.push(last_share);

                // Generate recipients matching shares length
                let mut recipients = soroban_sdk::vec![&env];
                let mut addrs = alloc::vec::Vec::new();
                for _ in normalized_shares.iter() {
                    let addr = soroban_sdk::Address::generate(&env);
                    recipients.push_back(acct(&addr));
                    addrs.push(addr);
                }

                // Convert shares to soroban Vec
                let mut soroban_shares = soroban_sdk::Vec::new(&env);
                for share in normalized_shares.iter() {
                    soroban_shares.push_back(*share);
                }

                // Create split and pay
                let id = client.create_split(&creator, &recipients, &soroban_shares, &None);
                // Generate recipients matching shares length
                let mut recipients = soroban_sdk::vec![&env];
                let mut addrs = soroban_sdk::Vec::new(&env);
                let mut sdk_shares = soroban_sdk::Vec::new(&env);
                for share in shares.iter() {
                    let addr = soroban_sdk::Address::generate(&env);
                    recipients.push_back(acct(&addr));
                    addrs.push_back(addr.clone());
                    sdk_shares.push_back(*share);
                }

                // Create split and pay
                // Skip invalid share configurations to focus on conservation for valid ones
                if client
                    .try_create_split(&creator, &recipients, &sdk_shares, &None)
                    .is_err()
                {
                    return Ok(());
                }
                let id = client.create_split(&creator, &recipients, &sdk_shares, &None);

                let payer = soroban_sdk::Address::generate(&env);
                let (token_id, token_client) = fund_token(&env, &payer, amount);
                client.pay(&payer, &id, &token_id, &amount);

                // Sum balances and assert conservation
                let mut received: i128 = 0;
                for addr in addrs.iter() {
                    received += token_client.balance(addr);
                }
                if received != amount {
                    return Err(proptest::test_runner::TestCaseError::fail(
                        "conservation failed",
                    ));
                }
                    received += token_client.balance(&addr);
                }
                proptest::prop_assert_eq!(received, amount);
                Ok(())
            },
        )
        .is_ok());
// Turns arbitrary positive weights into basis-point shares that sum to
// exactly TOTAL_SHARES, using the same floor-with-remainder-to-last approach
// as `amounts` in lib.rs, so `create_split`'s share-total check accepts them.
fn weights_to_shares(env: &Env, weights: &[u32]) -> Vec<u32> {
    let total: u64 = weights.iter().map(|&w| w as u64).sum();
    let last = weights.len() - 1;
    let mut shares = soroban_sdk::vec![env];
    let mut assigned: u64 = 0;
    for (i, &w) in weights.iter().enumerate() {
        let share = if i == last {
            TOTAL_SHARES as u64 - assigned
        } else {
            (w as u64 * TOTAL_SHARES as u64) / total
        };
        shares.push_back(share as u32);
        assigned += share;
    }
    shares
}

proptest::proptest! {
    #[test]
    fn property_conservation_random_shares(
        weights in proptest::collection::vec(1u32..=1_000u32, 2..10usize),
        amount in 1i128..1_000_000i128,
    ) {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Splitter, ());
        let client = SplitterClient::new(&env, &contract_id);
        let creator = soroban_sdk::Address::generate(&env);

        let shares = weights_to_shares(&env, &weights);
        let mut recipients = soroban_sdk::vec![&env];
        let mut addrs: Vec<Address> = soroban_sdk::vec![&env];
        for _ in shares.iter() {
            let addr = soroban_sdk::Address::generate(&env);
            recipients.push_back(acct(&addr));
            addrs.push_back(addr);
        }

        let id = client.create_split(&creator, &recipients, &shares, &None);
        let payer = soroban_sdk::Address::generate(&env);
        let (token_id, token_client) = fund_token(&env, &payer, amount);
        client.pay(&payer, &id, &token_id, &amount);

        let mut received: i128 = 0;
        for addr in addrs.iter() {
            received += token_client.balance(&addr);
        }
        proptest::prop_assert_eq!(received, amount);
    }
}

// Regression for #42: a high-supply token can be paid an amount large enough
// that `amount * share` overflows i128 in the old share math. The intermediate
// must be computed in 256-bit space so the split stays panic- and wrap-free and
// amount-in always equals amount-out.
#[test]
fn large_payment_does_not_overflow_share_math() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let c = Address::generate(&s.env);

    // Large enough that `amount * share` would overflow i128 for any share > 100,
    // but each recipient's final slice still fits comfortably in i128.
    let amount: i128 = i128::MAX / 100;
    let payer = Address::generate(&s.env);
    let (token_id, token_client) = fund_token(&s.env, &payer, amount);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b), acct(&c)],
        &vec![&s.env, 5_000, 3_000, 2_000],
        &None,
    );

    // Must not panic or wrap; the call returning is the first assertion.
    s.client.pay(&payer, &id, &token_id, &amount);

    // Each non-last recipient gets `amount * share / 10000` truncated; the last
    // recipient absorbs the rounding dust.
    let expected = |share: i128| -> i128 {
        soroban_sdk::I256::from_i128(&s.env, amount)
            .mul(&soroban_sdk::I256::from_i128(&s.env, share))
            .div(&soroban_sdk::I256::from_i128(&s.env, 10_000))
            .to_i128()
            .unwrap()
    };

    let a_bal = token_client.balance(&a);
    let b_bal = token_client.balance(&b);
    let c_bal = token_client.balance(&c);

    assert_eq!(a_bal, expected(5_000));
    assert_eq!(b_bal, expected(3_000));
    assert_eq!(c_bal, amount - a_bal - b_bal);
    assert_eq!(a_bal + b_bal + c_bal, amount);
    assert_eq!(token_client.balance(&payer), 0);
}
#[test]
fn held_tokens_tracking() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);

    let (token_x, _) = fund_token(&s.env, &payer, 1_000);
    let (token_y, _) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    // Initial state: no held tokens
    assert_eq!(s.client.held_tokens(&id), vec![&s.env]);

    // 1. Credit adds a token once
    s.client.deposit(&payer, &id, &token_x, &100);
    assert_eq!(s.client.held_tokens(&id), vec![&s.env, token_x.clone()]);

    // 2. A repeat credit does not duplicate it
    s.client.deposit(&payer, &id, &token_x, &100);
    assert_eq!(s.client.held_tokens(&id), vec![&s.env, token_x.clone()]);

    // Add another token
    s.client.deposit(&payer, &id, &token_y, &200);
    assert_eq!(
        s.client.held_tokens(&id),
        vec![&s.env, token_x.clone(), token_y.clone()]
    );

    // 3. Distribute removes the token
    s.client.distribute(&id, &token_x);
    assert_eq!(s.client.held_tokens(&id), vec![&s.env, token_y.clone()]);

    s.client.distribute(&id, &token_y);
    assert_eq!(s.client.held_tokens(&id), vec![&s.env]);
}

#[test]
fn close_split_reclaims_storage() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );

    s.client.close_split(&id);
    assert_eq!(s.client.try_get_split(&id), Err(Ok(Error::SplitNotFound)));
}

#[test]
fn close_split_rejects_if_balance_remains() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );

    s.client.deposit(&payer, &id, &token_id, &100);

    let result = s.client.try_close_split(&id);
    assert_eq!(result, Err(Ok(Error::SplitHasBalance)));

    // After distribute, it can be closed
    s.client.distribute(&id, &token_id);
    s.client.close_split(&id);
    assert_eq!(s.client.try_get_split(&id), Err(Ok(Error::SplitNotFound)));
}

#[test]
fn close_split_requires_auth() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );

    s.env.set_auths(&[]);
    let result = s.env.try_invoke_contract::<(), Error>(
        &s.client.address,
        &soroban_sdk::Symbol::new(&s.env, "close_split"),
        (&id,).into_val(&s.env),
    );
    assert!(result.is_err());
}

#[test]
fn close_split_rejects_immutable_split() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let result = s.client.try_close_split(&id);
    assert_eq!(result, Err(Ok(Error::SplitImmutable)));
}

mod fee_token {
    //! A minimal token that keeps a cut of every transfer, standing in for
    //! real-world fee-on-transfer tokens so `deposit` can be tested against
    //! a token that delivers less than the amount requested.
    use soroban_sdk::{
        contract, contractimpl, contracttype, token::TokenInterface, Address, Env, MuxedAddress,
        String,
    };

    #[contracttype]
    #[derive(Clone)]
    enum DataKey {
        Balance(Address),
        FeeBps,
    }

    #[contract]
    pub struct FeeToken;

    #[contractimpl]
    impl FeeToken {
        pub fn init(env: Env, fee_bps: u32) {
            env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        }

        pub fn mint(env: Env, to: Address, amount: i128) {
            let key = DataKey::Balance(to);
            let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage().persistent().set(&key, &(balance + amount));
        }
    }

    #[contractimpl]
    impl TokenInterface for FeeToken {
        fn allowance(_env: Env, _from: Address, _spender: Address) -> i128 {
            0
        }

        fn approve(
            _env: Env,
            _from: Address,
            _spender: Address,
            _amount: i128,
            _expiration_ledger: u32,
        ) {
        }

        fn balance(env: Env, id: Address) -> i128 {
            env.storage()
                .persistent()
                .get(&DataKey::Balance(id))
                .unwrap_or(0)
        }

        fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
            from.require_auth();
            let to = to.address();

            let from_key = DataKey::Balance(from.clone());
            let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&from_key, &(from_balance - amount));

            let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
            let fee = amount * fee_bps as i128 / 10_000;
            let received = amount - fee;

            let to_key = DataKey::Balance(to);
            let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&to_key, &(to_balance + received));
        }

        fn transfer_from(
            _env: Env,
            _spender: Address,
            _from: Address,
            _to: Address,
            _amount: i128,
        ) {
            panic!("not used in tests")
        }

        fn burn(_env: Env, _from: Address, _amount: i128) {
            panic!("not used in tests")
        }

        fn burn_from(_env: Env, _spender: Address, _from: Address, _amount: i128) {
            panic!("not used in tests")
        }

        fn decimals(_env: Env) -> u32 {
            7
        }

        fn name(env: Env) -> String {
            String::from_str(&env, "FeeToken")
        }

        fn symbol(env: Env) -> String {
            String::from_str(&env, "FEE")
        }
    }
}

fn fee_token(env: &Env, fee_bps: u32) -> (Address, fee_token::FeeTokenClient<'static>) {
    let contract_id = env.register(fee_token::FeeToken, ());
    let client = fee_token::FeeTokenClient::new(env, &contract_id);
    client.init(&fee_bps);
    (contract_id, client)
}

#[test]
fn deposit_credits_only_the_amount_actually_received() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    // 5% fee on transfer: a deposit of 1_000 only delivers 950 to the vault.
    let (token_id, token_client) = fee_token(&s.env, 500);
    token_client.mint(&payer, &1_000);

    s.client.deposit(&payer, &id, &token_id, &1_000);

    assert_eq!(token_client.balance(&s.client.address), 950);
    assert_eq!(s.client.balance(&id, &token_id), 950);
    assert_eq!(s.client.held_tokens(&id), vec![&s.env, token_id.clone()]);
}

#[test]
fn distribute_pays_out_the_fee_adjusted_balance() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let payer = Address::generate(&s.env);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a), acct(&b)],
        &vec![&s.env, 5_000, 5_000],
        &None,
    );

    // 10% fee on transfer: a deposit of 500 delivers 450 to the vault.
    let (token_id, token_client) = fee_token(&s.env, 1_000);
    token_client.mint(&payer, &500);

    s.client.deposit(&payer, &id, &token_id, &500);
    assert_eq!(s.client.balance(&id, &token_id), 450);

    let distributed = s.client.distribute(&id, &token_id);

    // The split only ever claimed to hold what actually arrived, so
    // distributing it does not try to move more than the vault has.
    assert_eq!(distributed, 450);
    assert_eq!(token_client.balance(&s.client.address), 0);
}
