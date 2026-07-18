# Security

Tributary moves money, so bugs here can cost people funds. The contract is not audited yet and only testnet deployments exist. Treat mainnet use as out of bounds until an audit lands.

## Reporting a vulnerability

Do not open a public issue for anything exploitable. Email afolabiayomide870@gmail.com with a description, reproduction steps and the affected component. You will get an answer within a few days.

Valid reports get credited in the release notes once a fix ships, if you want the credit.

## Scope

- `contracts/splitter`: highest severity, anything that misroutes, locks or loses funds
- `sdk` and `app`: transaction construction bugs that could trick a signer
- Infrastructure (CI, deploy scripts): supply chain concerns

## Threat Model & Security Architecture

For detailed information on trust assumptions, escrow risks, token assumptions, and known limitations, please refer to the [Security & Threat Model](docs/security-threat-model.md) documentation.
