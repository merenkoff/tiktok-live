-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 050_pos_stop_list_station.sql
-- Two facts the kitchen needs (café phase К3b, TechDocs/POS_CAFE.md §10,
-- POS_VERTICALS.md §7n): «сьогодні не робимо», and where a dish is made.
--
-- THE STOP-LIST is a day, not a flag. `pos_products.stop_listed_on` holds the
-- store-local day (`localDateString(timezone)` — the one «what day is it»
-- the order counter and the board already use) on which the barista pulled
-- the dish; every reader compares it with the same string, so any other day
-- means «on the menu» and the list forgets itself at the store's midnight
-- without a cron. On top of the stock-driven «закінчилось», never instead
-- of it: the tile greys with a caption either way (§3 «видно, а не зникло»),
-- and the sale is refused at checkout in so many words. A product, not a
-- variant — a cheesecake is off in every slice size — and not `sellable`,
-- which hides an ingredient from the till for good.
--
-- THE STATION is a column on the tag, not a tag name. 041's argument holds:
-- the tag is navigation the owner may rename or delete, and «this is made
-- at the bar» is a fact the ticket printer acts on. A product wearing tags of
-- two stations prints on both; one wearing none goes to the kitchen.
--
-- The demo café's stations are set HERE and not in 048: on a fresh database
-- 048 runs before this file, so it cannot name a column that does not exist
-- yet, and the runner re-applies every file on every boot — this UPDATE is
-- idempotent and also heals a later 048 rebuild, which recreates the tags
-- without a station. No `v_version` bump of 048 for it: a bump wipes the
-- demo store's sales on every install for nothing.

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS stop_listed_on DATE NULL;

COMMENT ON COLUMN pos_products.stop_listed_on IS
  'Manual stop-list («сьогодні не робимо»): the store-local day (localDateString(timezone)) the dish is off the menu. Compared as text with the same string; any other day = on the menu. On top of stock-driven availability, never instead of it.';

ALTER TABLE pos_tags
  ADD COLUMN IF NOT EXISTS station VARCHAR(16) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_tags_station_check'
  ) THEN
    ALTER TABLE pos_tags ADD CONSTRAINT pos_tags_station_check
      CHECK (station IS NULL OR station IN ('kitchen', 'bar'));
  END IF;
END $$;

COMMENT ON COLUMN pos_tags.station IS
  'Where a product wearing this tag is made (kitchen / bar); the kitchen ticket prints per station. A fact, hence a column (041''s argument), never a magic tag name.';

UPDATE pos_tags t
SET station = CASE t.name
  WHEN 'Кава'     THEN 'bar'
  WHEN 'Чай'      THEN 'bar'
  WHEN 'Вода'     THEN 'bar'
  WHEN 'Випічка'  THEN 'kitchen'
  WHEN 'Сніданки' THEN 'kitchen'
END
FROM pos_stores s
WHERE s.id = t.store_id
  AND s.slug = 'demo-cafe'
  AND t.station IS NULL
  AND t.name IN ('Кава', 'Чай', 'Вода', 'Випічка', 'Сніданки');
