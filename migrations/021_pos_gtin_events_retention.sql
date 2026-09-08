-- migrations/021_pos_gtin_events_retention.sql
-- Index `pos_gtin_lookup_events` by time, so both readers of that column stop
-- scanning the whole table.
--
-- One row is written per source per scan — three Open*Facts calls plus
-- UPCitemdb — and nothing ever read further back than 24 hours, so the table
-- only grew. Two queries now care about `fetched_at`: `learnStats`'s
-- `events_24h` counter, and the retention sweep added alongside this migration.
--
-- The existing indexes lead with `gtin` and `source`, so neither helps a query
-- that filters on time alone.

CREATE INDEX IF NOT EXISTS idx_pos_gtin_lookup_events_fetched_at
  ON pos_gtin_lookup_events(fetched_at);
