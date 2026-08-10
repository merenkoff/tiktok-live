-- migrations/008_pos_gtin_cache.sql
-- GTIN enrichment cache (no TTL) + lookup events + provider daily budgets

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS gtin_lookup_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS pos_gtin_cache (
  gtin VARCHAR(14) PRIMARY KEY,
  name TEXT,
  brand TEXT,
  image_url TEXT,
  best_source VARCHAR(64),
  filled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_gtin_lookup_events (
  id BIGSERIAL PRIMARY KEY,
  gtin VARCHAR(14) NOT NULL,
  source VARCHAR(64) NOT NULL,
  found BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  brand TEXT,
  image_url TEXT,
  raw_json JSONB,
  store_id BIGINT REFERENCES pos_stores(id) ON DELETE SET NULL,
  staff_id BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_gtin_lookup_events_gtin
  ON pos_gtin_lookup_events(gtin, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_gtin_lookup_events_source
  ON pos_gtin_lookup_events(source, fetched_at DESC);

CREATE TABLE IF NOT EXISTS pos_gtin_provider_budget (
  provider VARCHAR(64) NOT NULL,
  day_utc DATE NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  PRIMARY KEY (provider, day_utc)
);
