-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 054_pos_variant_pack.sql
-- How a variant ARRIVES, as opposed to how it is counted.
-- See TechDocs/POS_CAFE.md §10 (café phase К5).
--
-- Stock is counted in base units and always has been: 200 ml of milk is
-- quantity 200 in unit 'мл'. That is right for a recipe, for a write-off and
-- for the fiscal line, and it is wrong for exactly one person — whoever stands
-- at the back door with a delivery note. Oil arrives in bottles. Five bottles
-- is `5000`, and that multiplication happens in a human head every morning.
--
-- So: `pack_qty` is HOW MANY BASE UNITS ARE IN ONE PACK (1000 for a litre
-- bottle of something counted in ml), and `pack_label` is what to call it
-- («пляшка»). Both or neither — a pack with no name cannot be read off a
-- screen, a name with no number cannot be converted.
--
-- WHAT THIS IS NOT: it is not a second unit, and nothing downstream learns
-- about it. `pos_stock.quantity`, a document line, a recipe, a stock movement
-- and the receipt all stay in base units. The pack is a TYPING AID that lives
-- in the interface: the screen multiplies, the database never sees a bottle.
--
-- That is also why a document line carries no snapshot of the pack it was
-- typed in. A document written in March must not change meaning when the
-- owner switches supplier in June and a bottle becomes 750 ml; the honest
-- record of what arrived is «5000 мл», and any screen that wants to say
-- «5 пляшок» can divide by the pack the variant has TODAY, clearly as a
-- convenience rather than as history.
--
-- Deliberately one pack per variant, not a list: a shop that buys the same
-- oil in 1 L bottles and 5 L canisters is real but rarer than the daily pain
-- this removes, and a list costs a table, a screen and a choice on every line.

ALTER TABLE pos_variants
  ADD COLUMN IF NOT EXISTS pack_qty INTEGER,
  ADD COLUMN IF NOT EXISTS pack_label VARCHAR(32) NOT NULL DEFAULT '';

-- Re-runnable: the runner re-applies every file on every boot, so a CHECK is
-- always dropped before it is added.
ALTER TABLE pos_variants DROP CONSTRAINT IF EXISTS pos_variants_pack_qty_check;
ALTER TABLE pos_variants ADD CONSTRAINT pos_variants_pack_qty_check
  CHECK (pack_qty IS NULL OR pack_qty > 0);

-- Both or neither, enforced where it cannot be argued with. A row that has one
-- half of the pair is not a half-configured variant, it is an unreadable one.
ALTER TABLE pos_variants DROP CONSTRAINT IF EXISTS pos_variants_pack_pair_check;
ALTER TABLE pos_variants ADD CONSTRAINT pos_variants_pack_pair_check
  CHECK ((pack_qty IS NULL) = (pack_label = ''));

COMMENT ON COLUMN pos_variants.pack_qty IS
  'Base units in one purchase pack (1000 for a 1 L bottle counted in ml). NULL = no pack. A typing aid for the receiving screens only: stock, recipes, documents and receipts stay in base units.';
COMMENT ON COLUMN pos_variants.pack_label IS
  'What the pack is called («пляшка», «ящик»). Empty exactly when pack_qty is NULL.';
