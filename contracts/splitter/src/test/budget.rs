#![cfg(test)]
extern crate alloc;

extern crate std;
use crate::{Recipient, Splitter, SplitterClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, Env, Vec};
use std::fs::File;
use std::io::Write;

fn acct(a: &Address) -> Recipient {
    Recipient::Account(a.clone())
}

// Helper to construct worst cases
fn build_32_recipient_split(env: &Env, client: &SplitterClient<'static>, creator: &Address) -> u64 {
    let mut recipients = Vec::new(env);
    let mut shares = Vec::new(env);
    for _ in 0..32 {
        recipients.push_back(acct(&Address::generate(env)));
        shares.push_back(10_000 / 32);
    }
    // Adjust last to make it 10_000
    let last_share = 10_000 - (10_000 / 32 * 31);
    shares.set(31, last_share);
    client.create_split(creator, &recipients, &shares, &None)
}

// Helper to construct smaller cases to stay within test limits
fn build_5_recipient_split(env: &Env, client: &SplitterClient<'static>, creator: &Address) -> u64 {
    let mut recipients = Vec::new(env);
    let mut shares = Vec::new(env);
    for _ in 0..5 {
        recipients.push_back(acct(&Address::generate(env)));
        shares.push_back(10_000 / 5);
    }
    client.create_split(creator, &recipients, &shares, &None)
}

fn fund_token(env: &Env, payer: &Address, amount: i128) -> (Address, token::Client<'static>) {
    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token_id = sac.address();
    token::StellarAssetClient::new(env, &token_id).mint(payer, &amount);
    (token_id.clone(), token::Client::new(env, &token_id))
}

#[test]
#[ignore]
fn benchmark_costs() {
    let mut results = alloc::string::String::new();
    results.push_str("{\n");

    // 1. 32-recipient pay
    {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Splitter, ());
        let client = SplitterClient::new(&env, &contract_id);
        let payer = Address::generate(&env);
        let (token_id, _) = fund_token(&env, &payer, 1_000_000_000);
        let split_id = build_32_recipient_split(&env, &client, &payer);

        env.cost_estimate().budget().reset_unlimited(); // reset for clean measurement
        client.pay(&payer, &split_id, &token_id, &1_000_000);

        let cpu = env.cost_estimate().budget().cpu_instruction_cost();
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        results.push_str(&alloc::format!(
            "  \"pay_32\": {{ \"cpu\": {}, \"mem\": {} }},\n",
            cpu,
            mem
        ));
    }

    // 2. pay_many across 10 splits of 32 recipients
    {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Splitter, ());
        let client = SplitterClient::new(&env, &contract_id);
        let payer = Address::generate(&env);
        let (token_id, _) = fund_token(&env, &payer, 1_000_000_000);

        let mut ids = Vec::new(&env);
        let mut amounts = Vec::new(&env);
        for _ in 0..5 {
            ids.push_back(build_5_recipient_split(&env, &client, &payer));
            amounts.push_back(1_000_000);
        }

        env.cost_estimate().budget().reset_unlimited();
        client.pay_many(&payer, &ids, &amounts, &token_id);

        let cpu = env.cost_estimate().budget().cpu_instruction_cost();
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        results.push_str(&alloc::format!(
            "  \"pay_many_5x5\": {{ \"cpu\": {}, \"mem\": {} }},\n",
            cpu,
            mem
        ));
    }

    // 3. distribute of a large balance (32 recipients)
    {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Splitter, ());
        let client = SplitterClient::new(&env, &contract_id);
        let payer = Address::generate(&env);
        let (token_id, _) = fund_token(&env, &payer, 1_000_000_000);
        let split_id = build_32_recipient_split(&env, &client, &payer);

        client.deposit(&payer, &split_id, &token_id, &1_000_000_000);

        env.cost_estimate().budget().reset_unlimited();
        client.distribute(&split_id, &token_id);

        let cpu = env.cost_estimate().budget().cpu_instruction_cost();
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        results.push_str(&alloc::format!(
            "  \"distribute_32\": {{ \"cpu\": {}, \"mem\": {} }},\n",
            cpu,
            mem
        ));
    }

    // 4. Nested tree distribute_cascade at depth 5
    {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Splitter, ());
        let client = SplitterClient::new(&env, &contract_id);
        let payer = Address::generate(&env);
        let (token_id, _) = fund_token(&env, &payer, 1_000_000_000);

        let mut last_split = build_5_recipient_split(&env, &client, &payer);
        for _ in 1..5 {
            let mut recipients = Vec::new(&env);
            let mut shares = Vec::new(&env);
            recipients.push_back(Recipient::Split(last_split));
            shares.push_back(10_000 / 5);
            for _ in 1..5 {
                recipients.push_back(acct(&Address::generate(&env)));
                shares.push_back(10_000 / 5);
            }
            let last_share = 10_000 - (10_000 / 5 * 4);
            shares.set(4, last_share);
            last_split = client.create_split(&payer, &recipients, &shares, &None);
        }

        let root_split = last_split;
        client.deposit(&payer, &root_split, &token_id, &1_000_000_000);

        env.cost_estimate().budget().reset_unlimited();
        client.distribute_cascade(&root_split, &token_id, &5);

        let cpu = env.cost_estimate().budget().cpu_instruction_cost();
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        results.push_str(&alloc::format!(
            "  \"distribute_cascade_depth_5\": {{ \"cpu\": {}, \"mem\": {} }}\n",
            cpu,
            mem
        ));
    }

    results.push_str("}\n");

    let mut file = File::create("costs.json").unwrap();
    file.write_all(results.as_bytes()).unwrap();
}
