# Changelog

All notable changes to the `tributary-sdk` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Added

- Generated TypeScript client from the deployed Soroban contract spec.
- Pre-wired network configuration for the Stellar testnet deployment.
- `Client` class with methods for every contract function: `create_split`,
  `pay`, `pay_many`, `deposit`, `distribute`, `preview_payout`, `balance`,
  `update_split`, `transfer_control`, `get_split`, `splits_of`, and
  `split_count`.
- `Recipient` type supporting both `Account` (address) and `Split` (nested
  split id) variants.
- `networks` export with the testnet contract id and passphrase.
