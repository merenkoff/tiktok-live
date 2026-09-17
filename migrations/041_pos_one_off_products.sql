-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 041_pos_one_off_products.sql
-- A catalogue card that exists for ONE physical object.
-- See TechDocs/POS_FLORIST_BENCH.md §11.
--
-- A florist assembles a bouquet for the window and it goes into stock as a
-- composite with `stock_mode = 'own'` — assembled in advance, counted on its
-- own row, sold without touching the stems because the production document
-- already took them. So far that is exactly the shape migration 037 defined.
--
-- What this column adds is the distinction the shape alone cannot make. The
-- demo shop's «Букет Ніжність» is also `own`: it is a catalogue bouquet the
-- shop assembles in batches from a stored recipe, and it comes back next week.
-- A window bouquet made at the bench is a different animal — one object, one
-- price, one stem count, gone when it sells and never repeated. Both are
-- `composite` + `own`, and confusing them would put a hundred one-off cards
-- into the owner's product list as if they were product lines, and would make
-- «which bouquets sell best» meaningless.
--
-- Deliberately a column and not just the auto-assigned «Вітрина» tag: the tag
-- is navigation (the sell screen's catalog bar is built from tags, and a
-- florist wants every ready bouquet one tap away) and the owner may rename or
-- delete it. This is the fact.

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS one_off BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_products.one_off IS
  'This card exists for one physical object (a bouquet made at the bench for the window), not for a product line that repeats. Always composite+own when true.';

-- The owner's product list and the florist analytics both ask "the repeatable
-- catalogue, without the one-offs", which is the large side of the split.
CREATE INDEX IF NOT EXISTS idx_pos_products_one_off
  ON pos_products (store_id, one_off);
