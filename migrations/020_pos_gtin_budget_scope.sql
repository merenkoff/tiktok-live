-- migrations/020_pos_gtin_budget_scope.sql
-- Scope the daily provider budget to whoever actually holds the upstream quota.
--
-- The counter was keyed `(provider, day_utc)` — one bucket per provider for the
-- whole deployment — while `migrations/013_pos_store_settings.sql` gave every
-- store its own `gtin_api_key`. Two stores with two different upc.dev keys have
-- two independent 100/day allowances upstream, but shared one counter here: one
-- store's scans burned the other's, and a store's `gtin_daily_limit` was checked
-- against a number it did not own.
--
-- `scope` names the identity the provider rate-limits (see gtin/provider-budget.ts):
--   'shared'    — one bucket for the deployment (upcitemdb's trial is per-IP)
--   'key:<hash>'— one bucket per API key (upc.dev counts against the key)
--
-- Existing rows keep 'shared'; they are same-day counters at worst.

ALTER TABLE pos_gtin_provider_budget
  ADD COLUMN IF NOT EXISTS scope VARCHAR(64) NOT NULL DEFAULT 'shared';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_gtin_provider_budget_pkey'
      AND array_length(conkey, 1) = 2
  ) THEN
    ALTER TABLE pos_gtin_provider_budget DROP CONSTRAINT pos_gtin_provider_budget_pkey;
    ALTER TABLE pos_gtin_provider_budget
      ADD CONSTRAINT pos_gtin_provider_budget_pkey PRIMARY KEY (provider, scope, day_utc);
  END IF;
END
$$;
