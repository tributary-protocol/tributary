# Road to mainnet

What has to be true before Tributary handles real money. This is the working checklist; items get struck through as they land.

## Contract

- [ ] External security review of `contracts/splitter`, focused on the escrow balance accounting and nested routing
- [ ] Fuzz or property tests on the share math beyond the current conservation cases
- [ ] Upgrade story decided and documented: the contract is not upgradeable, so a v2 means a new address and a migration note
- [x] Gas and fee measurement for worst-case splits (32 recipients, nested one level)
  - **32-recipient pay:** 7,612,373 CPU instructions
  - **32-recipient distribute:** 7,860,215 CPU instructions
  - Measured via `contracts/splitter/src/test.rs` → `worst_case_32_recipients_cost`.
  - Both fit within the Soroban mainnet invocation limit of 600,000,000 instructions with ample headroom.

## Operations

- [ ] Mainnet deployment from a dedicated, hardware-backed deployer key
- [ ] Indexer running continuously against mainnet from block one, so history is complete
- [ ] Monitoring on distribute failures and balance drift between contract token balances and the sum of split credits

## Product

- [ ] App network switcher (testnet stays for trying things out)
- [ ] Mainnet token registry: native XLM and Circle USDC addresses
- [ ] Clear messaging that locked splits are permanent and deposits to them are unrecoverable if misconfigured

## Publishing

- [ ] `tributary-sdk` on npm with the mainnet contract in `networks`
- [ ] Integration guide updated with mainnet addresses

Nothing above is optional. Until every box is checked the README keeps saying do not put serious money through this.
