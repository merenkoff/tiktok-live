-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 116: a semi-finished product's recipe written for a batch («вихід», TechDocs/POS_VERTICALS.md §7u).
--
-- `pos_variants.recipe_yield`: the composition of this variant is written for N
-- of its base units, the way a kitchen's tech card is — «шия 2000 г, сіль 10 г…
-- вихід 1900 г». NULL = for one unit, which is every recipe written before this
-- file. The authored quantities stay whole; only what they are per changes.
--
-- `pos_product_components_flat.quantity_exact`: the exact share of a leaf in ONE
-- unit of the composite (131.578947… g of neck in a 125 g portion of shashlik).
-- NULL means «exactly quantity_per_unit», so the demo migrations that insert
-- into the flat table on their own (048, 053, 067, 069) need no change.
--
-- `quantity_per_unit` stays an INTEGER and is now GREATEST(1, ROUND(exact)):
-- what selling ONE unit writes off. Every reader on the selling path — the
-- write-off, the sale snapshot, the parked-cart reserve, a table's round, a
-- debt, a refund, the offline till — keeps reading it unchanged. Rounding
-- happens once, at the level of what is sold, never per semi-finished, and a
-- leaf is never rounded away (pepper 0.33 g in a portion is written off as
-- 1 g rather than vanishing from the stock). Readers that need the exact share
-- — the cost of a tech card, a production document, a modifier that writes
-- off a portion of a semi-finished — read `quantity_exact`.
--
-- This file is the LAST to rebuild the flat table on every boot: 045 skips its
-- own (integer) rebuild once `recipe_yield` exists, and the demo migrations'
-- per-store copies run before this one. `recomputeFlat` in
-- src/pos/composites.service.ts is the same walk for one store; the two are
-- pinned to each other row for row by `pos.composites.test.ts`.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, a named CHECK added once, and a full
-- DELETE + INSERT of a derived table.

ALTER TABLE pos_variants ADD COLUMN IF NOT EXISTS recipe_yield INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_variants_recipe_yield_check'
  ) THEN
    ALTER TABLE pos_variants
      ADD CONSTRAINT pos_variants_recipe_yield_check CHECK (recipe_yield IS NULL OR recipe_yield > 0);
  END IF;
END $$;

COMMENT ON COLUMN pos_variants.recipe_yield IS
  'The composition of this (composite) variant is written for this many of its base units — a tech card''s «вихід». NULL = for one unit (TechDocs/POS_VERTICALS.md §7u).';

ALTER TABLE pos_product_components_flat ADD COLUMN IF NOT EXISTS quantity_exact NUMERIC;

COMMENT ON COLUMN pos_product_components_flat.quantity_exact IS
  'Exact share of the leaf in ONE unit of the composite, recipe yields applied. NULL = exactly quantity_per_unit. quantity_per_unit is GREATEST(1, ROUND(this)) — what selling one unit writes off.';

DELETE FROM pos_product_components_flat;

INSERT INTO pos_product_components_flat (store_id, variant_id, leaf_variant_id, quantity_per_unit, quantity_exact)
WITH RECURSIVE walk AS (
  SELECT c.store_id,
         c.variant_id AS root_id,
         c.component_variant_id AS node_id,
         ROUND(c.quantity::numeric / COALESCE(rv.recipe_yield, 1), 12) AS qty,
         1 AS depth
  FROM pos_product_components c
  JOIN pos_variants rv ON rv.id = c.variant_id
  UNION ALL
  SELECT w.store_id,
         w.root_id,
         c.component_variant_id,
         ROUND(w.qty * c.quantity / COALESCE(nv.recipe_yield, 1), 12),
         w.depth + 1
  FROM walk w
  JOIN pos_variants nv ON nv.id = w.node_id
  JOIN pos_products np ON np.id = nv.product_id
  JOIN pos_product_components c ON c.variant_id = w.node_id AND c.store_id = w.store_id
  WHERE np.kind = 'composite' AND np.stock_mode = 'derived' AND w.depth < 8
)
SELECT w.store_id,
       w.root_id,
       w.node_id,
       GREATEST(1, ROUND(SUM(w.qty)))::int,
       ROUND(SUM(w.qty), 10)
FROM walk w
JOIN pos_variants lv ON lv.id = w.node_id
JOIN pos_products lp ON lp.id = lv.product_id
WHERE NOT (lp.kind = 'composite' AND lp.stock_mode = 'derived')
GROUP BY w.store_id, w.root_id, w.node_id;
