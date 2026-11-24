-- 001: Append-only event log. Source of truth for all projections.
CREATE TABLE IF NOT EXISTS events (
  id               BIGSERIAL PRIMARY KEY,
  event_id         TEXT UNIQUE NOT NULL,
  ledger           BIGINT NOT NULL,
  ledger_closed_at TIMESTAMPTZ NOT NULL,
  tx_hash          TEXT NOT NULL,
  type             TEXT NOT NULL,
  split_id         BIGINT NOT NULL,
  payload          JSONB NOT NULL,
  reverted         BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_split   ON events (split_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_ledger  ON events (ledger);
CREATE INDEX IF NOT EXISTS idx_events_reverted ON events (reverted) WHERE reverted;
