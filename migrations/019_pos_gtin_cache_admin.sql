-- migrations/019_pos_gtin_cache_admin.sql
-- Owner-facing repair of the shared GTIN cache: a tombstone column so a wrong
-- entry can be cleared for good, and an index so the owner can find one.
--
-- Clearing a row is not a DELETE: the automatic sources would simply refill it
-- with the same wrong name on the next scan. The row stays behind with its data
-- nulled and `blocked_at` set, and `ingestGtinResults` refuses to write to it
-- until an owner lifts the block.

ALTER TABLE pos_gtin_cache
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL;

-- Owner search by name. The barcode side of the search rides the PRIMARY KEY.
-- pg_trgm is contrib and present on Railway and on the CI image, but a missing
-- extension must not fail the migration — the search degrades to a scan.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_pos_gtin_cache_name_trgm
    ON pos_gtin_cache USING gin (name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pos_gtin_cache: skipping trigram index (%)', SQLERRM;
END
$$;
