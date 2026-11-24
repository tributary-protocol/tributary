# Indexer Design

Event-sourced accounting service for the Tributary splitter contract.

## Architecture

```
Soroban RPC ──► Ingestion Worker ──► Postgres (events) ──► Projection Builders
                                                  │                   │
                                                  │           ┌───────┘
                                                  │           ▼
                                                  │    Projection Tables
                                                  │    (splits, balances,
                                                  │     payouts, earnings)
                                                  │           │
                                                  │           ▼
                                                  │    Query API (Hono)
                                                  │
                                                  └──► Reconciliation Job
                                                         │
                                                         ▼
                                                    On-chain RPC calls
                                                         │
                                                         ▼
                                                    Webhook alerts
```

The append-only `events` table is the source of truth for all projections. Dropping all projection tables and replaying the event log reproduces identical state.

## Event Schema

### events table

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL` | Global sequence number |
| `event_id` | `TEXT` | Stellar event unique id (UNIQUE) |
| `ledger` | `BIGINT` | Ledger the event appeared in |
| `ledger_closed_at` | `TIMESTAMPTZ` | Ledger close timestamp |
| `tx_hash` | `TEXT` | Transaction hash |
| `type` | `TEXT` | One of the six event types |
| `split_id` | `BIGINT` | Topic-keyed split id |
| `payload` | `JSONB` | Typed payload per event |
| `reverted` | `BOOLEAN` | Set TRUE on reorg |
| `ingested_at` | `TIMESTAMPTZ` | When the row was written |

### Event types and payloads

**SplitCreated**
```json
{
  "creator": "G...",
  "recipients": [{"type": "Account", "address": "G..."}],
  "shares": [6000, 4000]
}
```

**SplitPaid**
```json
{
  "token": "G...",
  "amount": "100000",
  "legs": [{"recipient": "G...", "share_bps": 6000, "leg_amount": "60000"}]
}
```
`legs` is null until #258 (per-recipient payout legs) is implemented.

**Deposited**
```json
{
  "token": "G...",
  "amount": "50000",
  "source": "unknown"
}
```
`source` is "unknown" until #267 (deposit vs routing) distinguishes external deposits from nested-split routing.

**Distributed**
```json
{
  "token": "G...",
  "amount": "50000",
  "legs": [{"recipient": "G...", "share_bps": 10000, "leg_amount": "50000"}]
}
```

**SplitUpdated**
```json
{
  "recipients": [{"type": "Account", "address": "G..."}],
  "shares": [10000]
}
```

**ControlTransferred**
```json
{
  "new_controller": "G..." 
}
```
`new_controller` is null when locking the split.

## Projection Tables

### splits
Current state of each split.

| Column | Type |
|---|---|
| `id` | `BIGINT` (PK) |
| `creator` | `TEXT` |
| `recipients` | `JSONB` |
| `shares` | `JSONB` |
| `controller` | `TEXT` (nullable) |
| `created_at` | `TIMESTAMPTZ` |
| `updated_at` | `TIMESTAMPTZ` |

### split_balances
Escrow balance per split and token.

| Column | Type |
|---|---|
| `split_id` | `BIGINT` (composite PK) |
| `token` | `TEXT` (composite PK) |
| `balance` | `NUMERIC` |
| `updated_at` | `TIMESTAMPTZ` |

### payout_history
One row per recipient per payout event.

| Column | Type |
|---|---|
| `id` | `BIGSERIAL` (PK) |
| `split_id` | `BIGINT` |
| `token` | `TEXT` |
| `total_amount` | `NUMERIC` |
| `recipient` | `TEXT` |
| `share_bps` | `INT` |
| `leg_amount` | `NUMERIC` |
| `tx_hash` | `TEXT` |
| `ledger` | `BIGINT` |
| `timestamp` | `TIMESTAMPTZ` |

### recipient_earnings
Aggregate earnings per recipient address.

| Column | Type |
|---|---|
| `address` | `TEXT` (PK) |
| `token` | `TEXT` |
| `total_earned` | `NUMERIC` |
| `payout_count` | `INT` |
| `last_payout_at` | `TIMESTAMPTZ` (nullable) |

## Reconciliation

Periodic job that proves projected balances equal on-chain state.

1. Query all `(split_id, token)` pairs from `split_balances` where `balance != 0`
2. Call `balance(split_id, token)` on-chain via Soroban RPC
3. Compare values
4. On mismatch, binary-search the event log to find the first divergent event
5. POST to `RECONCILIATION_WEBHOOK_URL` with drift details
6. Update `/health` status

### Drift detection

When a mismatch is found, the reconciliation job replays events for the affected split from the beginning, tracking the simulated balance. The first event where the simulated balance diverges from the projected balance is reported as the root cause.

## Reorg Handling

- Cursor tracks `(ledger, event_id)` pairs in `ingestion_state`
- On each poll, if the RPC cursor rewinds past a previously ingested ledger:
  - All events from affected ledgers are marked `reverted = TRUE`
  - Projection state is rolled back for reverted events
  - Events are re-ingested from the rewound point
- `event_id` UNIQUE constraint prevents duplicate ingestion

## Exactly-Once Ingestion

- `event_id` UNIQUE constraint on the events table
- `INSERT ... ON CONFLICT (event_id) DO NOTHING`
- Cursor stored in `ingestion_state` table, updated after each successful batch

## Rebuild

Dropping all projection tables and replaying the event log produces identical state. This is used for:
- Initial setup
- Schema changes to projection tables
- Recovery from corruption
- Testing

## Dependencies on Contract Changes

| Issue | Impact | Mitigation |
|---|---|---|
| #258 (per-recipient payout legs) | `payout_history` and `recipient_earnings` are incomplete | Build with nullable `legs`; enrichment is a one-function change |
| #267 (deposit vs routing) | Cannot distinguish external deposits from nested routing | `source` column defaults to "unknown"; retroactively classify when #267 lands |
| #80 (reorg handling) | Reorg safety depends on idempotent re-scans | UNIQUE constraint + cursor tracking provides the foundation |
| #81 (restart durability) | Cursor must survive restarts | Solved by storing cursor in Postgres instead of state.json |
