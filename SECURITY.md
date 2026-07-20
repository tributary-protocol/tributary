# Security

Tributary moves money, so bugs here can cost people funds. The contract is not audited yet and only testnet deployments exist. Treat mainnet use as out of bounds until an audit lands.

## Reporting a vulnerability

Do not open a public issue for anything exploitable. Email afolabiayomide870@gmail.com with a description, reproduction steps and the affected component. You will get an answer within a few days.

Valid reports get credited in the release notes once a fix ships, if you want the credit.

## Scope

- `contracts/splitter`: highest severity, anything that misroutes, locks or loses funds
- `sdk` and `app`: transaction construction bugs that could trick a signer
- Infrastructure (CI, deploy scripts): supply chain concerns

## Trust model: escrow and mutable splits

A split with a `controller` is mutable: the controller can call `update_split`
at any time to replace its recipients and shares. Money sitting in escrow
(credited by `deposit`, paid out by `distribute`) is only ever routed
according to whatever table is on the split when `distribute` runs — not the
table that was in place when the deposit was made.

To keep a depositor's funds from being redirected between `deposit` and
`distribute`, `update_split` refuses to run while the split holds a balance
in any token (see `held_tokens`); the controller must `distribute` first.
This closes the gap for outstanding escrow, but the controller can still
change recipients the moment before the *next* deposit arrives, and can
change them freely between distributions with nothing held. Depositing
against a mutable split is a trust relationship with its controller, not a
guarantee that today's routing table is the one that pays out — if that
matters to you, deposit against an immutable split (`controller: None`)
instead, whose routing table can never change.
