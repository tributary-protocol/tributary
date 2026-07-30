# tributary-cli

A tiny command-line wrapper around `tributary-sdk` for quickly creating,
paying, and previewing splits on Stellar testnet without writing a script
or opening the [dashboard](../../app).

It complements [`node-create-and-pay`](../node-create-and-pay) (a fixed
end-to-end script) by exposing the same operations as ad-hoc commands you
can run individually, with `--help` text for each.

## Setup

Build the sdk once (the example depends on it via a local `file:` reference):