-- 002: Projection tables rebuilt from the event log.

-- Current state of each split.
CREATE TABLE IF NOT EXISTS splits (
  id          BIGINT PRIMARY KEY,
  creator     TEXT NOT NULL,
  recipients  JSONB NOT NULL,
  shares      JSONB NOT NULL,
  controller  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Escrow balance per split and token.
CREATE TABLE IF NOT EXISTS split_balances (
  split_id    BIGINT NOT NULL,
  token       TEXT NOT NULL,
  balance     NUMERIC NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (split_id, token)
);

-- One row per recipient per payout event.
CREATE TABLE IF NOT EXISTS payout_history (
  id              BIGSERIAL PRIMARY KEY,
  split_id        BIGINT NOT NULL,
  token           TEXT NOT NULL,
  total_amount    NUMERIC NOT NULL,
  recipient       TEXT NOT NULL,
  share_bps       INT NOT NULL,
  leg_amount      NUMERIC NOT NULL,
  tx_hash         TEXT NOT NULL,
  ledger          BIGINT NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payout_history_split ON payout_history (split_id);
CREATE INDEX IF NOT EXISTS idx_payout_history_recipient ON payout_history (recipient);

-- Aggregate earnings per recipient address.
CREATE TABLE IF NOT EXISTS recipient_earnings (
  address         TEXT PRIMARY KEY,
  token           TEXT NOT NULL,
  total_earned    NUMERIC NOT NULL DEFAULT 0,
  payout_count    INT NOT NULL DEFAULT 0,
  last_payout_at  TIMESTAMPTZ
);
