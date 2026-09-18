-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 045_pos_product_components_flat.sql
-- A recipe inside a recipe: the composition, expanded to stock leaves.
-- See TechDocs/POS_CAFE.md §9 (café phase К1d) and POS_VERTICALS.md §7j.
--
-- Migration 037 made a composite one level deep on purpose — a bouquet holds
-- stems, never another bouquet — and every reader of the recipe (the three
-- availability queries, the sale's write-off, the production document) could
-- therefore read `pos_product_components` directly. A café breaks that: a
-- latte holds a syrup that is itself a recipe, and a sauce that was made in
-- advance from a recipe of its own.
--
-- Rather than teach every reader to recurse, this table keeps each composite's
-- recipe ALREADY EXPANDED to the shelves it actually takes from:
--   - a simple component is a leaf, as before;
--   - a component that is a composite made in advance (`stock_mode = 'own'`)
--     is a leaf too — it has its own stock row, and its ingredients left with
--     its production document;
--   - a component that is a composite assembled when it sells ('derived')
--     is not a leaf: its own expansion is folded in, quantities multiplied,
--     and the same leaf reached twice (sugar in the syrup and sugar on its
--     own) is summed into one row.
-- `pos_product_components` stays the AUTHORED recipe — what the owner edits
-- and what the bench and the catalog show. The two never disagree, because
-- this table is rewritten from the other on every recipe write
-- (`recomputeFlat` in composites.service.ts) and, below, on every boot.
--
-- The boot-time rebuild is what makes this migration re-runnable AND what
-- makes the service's incremental rebuild honest: 039 rebuilds the flower
-- demo's catalogue on a version bump (cascading these rows away), and every
-- database that predates 045 has one-level recipes, so the walk below
-- reproduces the authored rows exactly. `pos.composites.test.ts` pins the
-- service's per-store walk against this one.

CREATE TABLE IF NOT EXISTS pos_product_components_flat (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- The composite whose recipe this is.
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    -- A shelf it takes from. CASCADE, unlike the authored row: that one is
    -- the guard (deleting a leaf out from under a recipe is refused there),
    -- this one is a cache of it, and a cache must never be what stops a
    -- delete the guard allowed — 039's demo rebuild deletes the authored
    -- rows first and the variants after, and would trip over this otherwise.
    leaf_variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    -- Per ONE unit of the composite, in the leaf's own unit, whole — the same
    -- INTEGER-in-base-unit rule as everywhere else.
    quantity_per_unit INTEGER NOT NULL CHECK (quantity_per_unit > 0),
    PRIMARY KEY (variant_id, leaf_variant_id)
);

-- "Where is this ingredient used?" — the owner asks before delisting it, and
-- the service walks it upward when an inner recipe changes.
CREATE INDEX IF NOT EXISTS idx_pos_product_components_flat_leaf
  ON pos_product_components_flat (store_id, leaf_variant_id);

COMMENT ON TABLE pos_product_components_flat IS
  'Recipe of a composite variant expanded to stock leaves (a derived composite inside it is folded in, an own one stays a leaf). Derived from pos_product_components on every recipe write and on every boot; availability, write-off and production read this, the editor reads the authored table.';

-- Full rebuild, every boot. The depth guard only bounds a walk that the
-- service never lets become cyclic; a vertical allows at most 3 levels.
DELETE FROM pos_product_components_flat;

INSERT INTO pos_product_components_flat (store_id, variant_id, leaf_variant_id, quantity_per_unit)
WITH RECURSIVE walk AS (
  SELECT c.store_id,
         c.variant_id AS root_id,
         c.component_variant_id AS node_id,
         c.quantity::bigint AS qty,
         1 AS depth
  FROM pos_product_components c
  UNION ALL
  SELECT w.store_id,
         w.root_id,
         c.component_variant_id,
         w.qty * c.quantity,
         w.depth + 1
  FROM walk w
  JOIN pos_variants nv ON nv.id = w.node_id
  JOIN pos_products np ON np.id = nv.product_id
  JOIN pos_product_components c ON c.variant_id = w.node_id AND c.store_id = w.store_id
  WHERE np.kind = 'composite' AND np.stock_mode = 'derived' AND w.depth < 8
)
SELECT w.store_id, w.root_id, w.node_id, SUM(w.qty)::int
FROM walk w
JOIN pos_variants lv ON lv.id = w.node_id
JOIN pos_products lp ON lp.id = lv.product_id
WHERE NOT (lp.kind = 'composite' AND lp.stock_mode = 'derived')
GROUP BY w.store_id, w.root_id, w.node_id;
