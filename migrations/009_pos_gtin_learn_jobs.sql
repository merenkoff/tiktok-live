-- migrations/009_pos_gtin_learn_jobs.sql
-- Background / CLI seed jobs for GTIN cache learning from Open*Facts dumps

CREATE TABLE IF NOT EXISTS pos_gtin_learn_jobs (
  id BIGSERIAL PRIMARY KEY,
  status VARCHAR(32) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  datasets JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode VARCHAR(32) NOT NULL DEFAULT 'upsert',
  limit_rows INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_gtin_learn_jobs_status
  ON pos_gtin_learn_jobs(status, created_at DESC);
