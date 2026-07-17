#![cfg(test)]
extern crate alloc;

use super::*;
use proptest::prelude::*;
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
fn splits_of_paged_and_count() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);

    // Create 5 splits for one creator so we have more than one page.
    for _ in 0..5 {
        s.client.create_split(
            &creator,
            &vec![&s.env, acct(&a)],
            &vec![&s.env, 10_000],
            &None,
        );
    }

    assert_eq!(s.client.splits_of_count(&creator), 5);

    // Page size 2: walk through all 5 items across 3 pages.
    assert_eq!(
        s.client.splits_of_paged(&creator, &0, &2),
        vec![&s.env, 0, 1]
    );
    assert_eq!(
        s.client.splits_of_paged(&creator, &2, &2),
        vec![&s.env, 2, 3]
    );
    assert_eq!(s.client.splits_of_paged(&creator, &4, &2), vec![&s.env, 4]);

    // Start beyond the end returns empty.
    assert_eq!(s.client.splits_of_paged(&creator, &5, &2), vec![&s.env]);

    // Limit 0 returns empty.
    assert_eq!(s.client.splits_of_paged(&creator, &0, &0), vec![&s.env]);

    // Full-page fetch equivalent to splits_of.
    assert_eq!(
        s.client.splits_of_paged(&creator, &0, &5),
        vec![&s.env, 0, 1, 2, 3, 4]
    );

    // A creator with no splits returns empty for both count and paged.
    let stranger = Address::generate(&s.env);
    assert_eq!(s.client.splits_of_count(&stranger), 0);
    assert_eq!(s.client.splits_of_paged(&stranger, &0, &10), vec![&s.env]);
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
fn pay_many_multi_settles_mixed_tokens_at_once() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_x, client_x) = fund_token(&s.env, &payer, 10_000);
    let (token_y, client_y) = fund_token(&s.env, &payer, 10_000);

    let first = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    let second = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&b)],
        &vec![&s.env, 10_000],
        &None,
    );

    s.client.pay_many_multi(
        &payer,
        &vec![&s.env, first, second],
        &vec![&s.env, 1_000, 2_000],
        &vec![&s.env, token_x.clone(), token_y.clone()],
    );

    assert_eq!(client_x.balance(&a), 1_000);
    assert_eq!(client_x.balance(&payer), 9_000);
    assert_eq!(client_y.balance(&b), 2_000);
    assert_eq!(client_y.balance(&payer), 8_000);
}

#[test]
fn pay_many_multi_reverts_the_whole_batch_on_failure() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_x, client_x) = fund_token(&s.env, &payer, 10_000);
    let (token_y, _) = fund_token(&s.env, &payer, 10_000);

    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );

    let result = s.client.try_pay_many_multi(
        &payer,
        &vec![&s.env, id, 99],
        &vec![&s.env, 100, 200],
        &vec![&s.env, token_x.clone(), token_y],
    );
    assert_eq!(result, Err(Ok(Error::SplitNotFound)));
    assert_eq!(client_x.balance(&a), 0);
    assert_eq!(client_x.balance(&payer), 10_000);
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
fn every_error_code_maps_to_its_triggering_call() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let controller = Address::generate(&s.env);
    let a = Address::generate(&s.env);
    let b = Address::generate(&s.env);
    let payer = Address::generate(&s.env);
    let (token_id, _) = fund_token(&s.env, &payer, 1_000);

    // 1 NoRecipients — create_split with empty recipients (via validate)
    assert_eq!(
        s.client
            .try_create_split(&creator, &vec![&s.env], &vec![&s.env], &None),
        Err(Ok(Error::NoRecipients))
    );
    // 1 NoRecipients — pay_many with empty ids
    assert_eq!(
        s.client
            .try_pay_many(&payer, &vec![&s.env], &vec![&s.env], &token_id),
        Err(Ok(Error::NoRecipients))
    );

    // 2 LengthMismatch — create_split recipients/shares length differ (via validate)
    assert_eq!(
        s.client.try_create_split(
            &creator,
            &vec![&s.env, acct(&a), acct(&b)],
            &vec![&s.env, 10_000],
            &None,
        ),
        Err(Ok(Error::LengthMismatch))
    );
    // 2 LengthMismatch — pay_many ids/amounts length differ
    let id = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    assert_eq!(
        s.client.try_pay_many(
            &payer,
            &vec![&s.env, id],
            &vec![&s.env, 100, 200],
            &token_id,
        ),
        Err(Ok(Error::LengthMismatch))
    );

    // 3 ZeroShare — create_split with a zero share (via validate)
    assert_eq!(
        s.client.try_create_split(
            &creator,
            &vec![&s.env, acct(&a), acct(&b)],
            &vec![&s.env, 10_000, 0],
            &None,
        ),
        Err(Ok(Error::ZeroShare))
    );

    // 4 BadShareTotal — create_split shares do not sum to 10_000 (via validate)
    assert_eq!(
        s.client.try_create_split(
            &creator,
            &vec![&s.env, acct(&a), acct(&b)],
            &vec![&s.env, 5_000, 4_000],
            &None,
        ),
        Err(Ok(Error::BadShareTotal))
    );

    // 5 SplitNotFound — pay references an unknown split (via load)
    assert_eq!(
        s.client.try_pay(&payer, &99, &token_id, &100),
        Err(Ok(Error::SplitNotFound))
    );

    // 6 SplitImmutable — update_split on a locked split (controller == None)
    let locked = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &None,
    );
    assert_eq!(
        s.client
            .try_update_split(&locked, &vec![&s.env, acct(&a)], &vec![&s.env, 10_000]),
        Err(Ok(Error::SplitImmutable))
    );
    // 6 SplitImmutable — transfer_control on a locked split
    assert_eq!(
        s.client
            .try_transfer_control(&locked, &Some(controller.clone())),
        Err(Ok(Error::SplitImmutable))
    );

    // 7 InvalidAmount — pay with zero amount
    assert_eq!(
        s.client.try_pay(&payer, &id, &token_id, &0),
        Err(Ok(Error::InvalidAmount))
    );
    // 7 InvalidAmount — deposit with zero amount
    assert_eq!(
        s.client.try_deposit(&payer, &id, &token_id, &0),
        Err(Ok(Error::InvalidAmount))
    );
    // 7 InvalidAmount — preview_payout with zero amount
    assert_eq!(
        s.client.try_preview_payout(&id, &0),
        Err(Ok(Error::InvalidAmount))
    );

    // 8 NothingToDistribute — distribute with empty escrow balance
    assert_eq!(
        s.client.try_distribute(&id, &token_id),
        Err(Ok(Error::NothingToDistribute))
    );

    // 9 TooManyRecipients — create_split with > 32 recipients (via validate)
    let mut recipients = vec![&s.env, acct(&a)];
    let mut shares = vec![&s.env, 300u32];
    for _ in 0..32 {
        recipients.push_back(acct(&Address::generate(&s.env)));
        shares.push_back(300u32);
    }
    assert_eq!(
        s.client
            .try_create_split(&creator, &recipients, &shares, &None),
        Err(Ok(Error::TooManyRecipients))
    );

    // 10 BadChildSplit — create_split referencing an unknown split (via validate)
    assert_eq!(
        s.client.try_create_split(
            &creator,
            &vec![&s.env, acct(&a), Recipient::Split(7)],
            &vec![&s.env, 5_000, 5_000],
            &None,
        ),
        Err(Ok(Error::BadChildSplit))
    );
    // 10 BadChildSplit — update_split referencing itself (via validate)
    let mutable = s.client.create_split(
        &creator,
        &vec![&s.env, acct(&a)],
        &vec![&s.env, 10_000],
        &Some(controller.clone()),
    );
    assert_eq!(
        s.client.try_update_split(
            &mutable,
            &vec![&s.env, acct(&a), Recipient::Split(mutable)],
            &vec![&s.env, 5_000, 5_000],
        ),
        Err(Ok(Error::BadChildSplit))
    );
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
