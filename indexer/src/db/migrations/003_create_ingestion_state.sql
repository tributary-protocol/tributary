-- 003: Ingestion cursor and service health state.
CREATE TABLE IF NOT EXISTS ingestion_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed the cursor row.
INSERT INTO ingestion_state (key, value)
VALUES ('cursor', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ingestion_state (key, value)
VALUES ('last_reconciled_at', '')
ON CONFLICT (key) DO NOTHING;
