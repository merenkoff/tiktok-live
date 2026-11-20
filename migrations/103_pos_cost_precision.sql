-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 103: a purchase price finer than a whole kopeck per base unit
-- (TechDocs/POS_VERTICALS.md §7t).
--
-- `cost_cents` is whole kopecks per BASE unit, and for a kitchen the base unit
-- is a gram or a millilitre — so the price of a kilogram moved in steps of
-- 10 ₴: sugar at 35,50 ₴/кг was stored as 4 kopecks a gram, i.e. 40 ₴/кг, and a
-- dish's food cost was wrong by that much.
--
-- The precise figure is `cost_milli`: THOUSANDTHS of a kopeck per base unit.
-- 35,50 ₴/кг = 3550 kopecks a kilogram = exactly 3550 thousandths a gram, so a
-- price per kilogram or litre is kept to the kopeck, quantities stay whole
-- grams and money stays an integer. Every sum reads this column.
--
-- `cost_cents` stays, as the ROUNDED copy of it: tills and module bundles that
-- are already released read it, and so do the demo migrations and anything
-- that writes a price with plain SQL. The triggers below keep each pair in
-- step in both directions, so the two can never disagree:
--   · the precise column written        → the old one becomes its rounding;
--   · only the old column written       → the precise one becomes it × 1000;
--   · the old column written with the value it already has (an older client
--     sending back what it read)        → nothing changes, precision is kept.
--
-- The same pair on a stock document's line and on a stock movement, where the
-- price of ONE receipt is kept (`unit_cost_cents` / `unit_cost_milli`, both
-- nullable: a line that states no price).
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, triggers
-- created only when absent, and a backfill whose WHERE no row matches twice.

ALTER TABLE pos_variants
  ADD COLUMN IF NOT EXISTS cost_milli BIGINT NOT NULL DEFAULT 0
  CHECK (cost_milli >= 0 AND cost_milli <= 2147483647000);

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS unit_cost_milli BIGINT
  CHECK (unit_cost_milli IS NULL OR (unit_cost_milli >= 0 AND unit_cost_milli <= 2147483647000));

ALTER TABLE pos_stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost_milli BIGINT
  CHECK (unit_cost_milli IS NULL OR (unit_cost_milli >= 0 AND unit_cost_milli <= 2147483647000));

COMMENT ON COLUMN pos_variants.cost_milli IS
  'Last purchase price in THOUSANDTHS of a kopeck per base unit — the figure every sum reads. cost_cents is its rounded copy, kept in step by a trigger (migration 103).';
COMMENT ON COLUMN pos_stock_document_lines.unit_cost_milli IS
  'The line''s price in thousandths of a kopeck per base unit; unit_cost_cents is its rounded copy (migration 103).';
COMMENT ON COLUMN pos_stock_movements.unit_cost_milli IS
  'The movement''s price in thousandths of a kopeck per base unit; unit_cost_cents is its rounded copy (migration 103).';

CREATE OR REPLACE FUNCTION pos_cost_sync() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cost_milli = 0 AND NEW.cost_cents > 0 THEN
      NEW.cost_milli := NEW.cost_cents::bigint * 1000;
    ELSE
      NEW.cost_cents := ROUND(NEW.cost_milli / 1000.0);
    END IF;
  ELSIF NEW.cost_milli IS DISTINCT FROM OLD.cost_milli THEN
    NEW.cost_cents := ROUND(NEW.cost_milli / 1000.0);
  ELSIF NEW.cost_cents IS DISTINCT FROM OLD.cost_cents THEN
    NEW.cost_milli := NEW.cost_cents::bigint * 1000;
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pos_unit_cost_sync() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.unit_cost_milli IS NULL THEN
      NEW.unit_cost_milli := NEW.unit_cost_cents::bigint * 1000;
    ELSE
      NEW.unit_cost_cents := ROUND(NEW.unit_cost_milli / 1000.0);
    END IF;
  ELSIF NEW.unit_cost_milli IS DISTINCT FROM OLD.unit_cost_milli THEN
    NEW.unit_cost_cents := ROUND(NEW.unit_cost_milli / 1000.0);
  ELSIF NEW.unit_cost_cents IS DISTINCT FROM OLD.unit_cost_cents THEN
    NEW.unit_cost_milli := NEW.unit_cost_cents::bigint * 1000;
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'pos_variants_cost_sync' AND tgrelid = 'pos_variants'::regclass
  ) THEN
    CREATE TRIGGER pos_variants_cost_sync
      BEFORE INSERT OR UPDATE ON pos_variants
      FOR EACH ROW EXECUTE FUNCTION pos_cost_sync();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'pos_stock_document_lines_cost_sync'
      AND tgrelid = 'pos_stock_document_lines'::regclass
  ) THEN
    CREATE TRIGGER pos_stock_document_lines_cost_sync
      BEFORE INSERT OR UPDATE ON pos_stock_document_lines
      FOR EACH ROW EXECUTE FUNCTION pos_unit_cost_sync();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'pos_stock_movements_cost_sync'
      AND tgrelid = 'pos_stock_movements'::regclass
  ) THEN
    CREATE TRIGGER pos_stock_movements_cost_sync
      BEFORE INSERT OR UPDATE ON pos_stock_movements
      FOR EACH ROW EXECUTE FUNCTION pos_unit_cost_sync();
  END IF;
END
$triggers$;

-- What was stored before this migration, and what an earlier file of this very
-- boot wrote on a database that did not have the triggers yet. A row can match
-- only once: a precise price below half a kopeck rounds to `cost_cents` 0.
UPDATE pos_variants
SET cost_milli = cost_cents::bigint * 1000
WHERE cost_milli = 0 AND cost_cents > 0;

UPDATE pos_stock_document_lines
SET unit_cost_milli = unit_cost_cents::bigint * 1000
WHERE unit_cost_milli IS NULL AND unit_cost_cents IS NOT NULL;

UPDATE pos_stock_movements
SET unit_cost_milli = unit_cost_cents::bigint * 1000
WHERE unit_cost_milli IS NULL AND unit_cost_cents IS NOT NULL;
