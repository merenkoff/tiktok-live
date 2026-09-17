-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 037_pos_product_components.sql
-- Composite products: a bouquet (flowers) and, later, a dish (café) are one
-- sellable variant assembled from other variants. 035 reserved
-- `pos_products.kind`; this migration gives the composition somewhere to live
-- and says where the composite's stock comes from.
-- See TechDocs/POS_VERTICALS.md §5.
--
-- The composition hangs off the VARIANT, not the product: a bouquet sold in S /
-- M / L is one product whose sizes differ precisely in how many stems go in.
--
-- `stock_mode` is per product and only means something for `kind='composite'`:
--   'derived' — no stock of its own; availability and write-off are the
--               components' (assembled at the counter when it sells).
--   'own'     — assembled in advance, counted on its own `pos_stock` row; the
--               components were written off by the production document, so
--               selling it must NOT touch them again.
-- Both from the start, because a florist runs both at once: ready bouquets in
-- the fridge and made-to-order ones from the same catalogue card.

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'own';
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_stock_mode_check;
ALTER TABLE pos_products
  ADD CONSTRAINT pos_products_stock_mode_check CHECK (stock_mode IN ('own', 'derived'));

CREATE TABLE IF NOT EXISTS pos_product_components (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- The composite variant being assembled.
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    -- What goes into it. NO ACTION (the default), not CASCADE: silently deleting
    -- a component would turn a bouquet into a cheaper bouquet with no trace, so
    -- the delete is refused instead. Deliberately not RESTRICT — RESTRICT fires
    -- immediately, so dropping the whole store would trip over its own cascade;
    -- NO ACTION is checked at end of statement, by which time both sides are gone.
    component_variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    -- Counted in the component variant's own `unit` (5 stems, 250 g), same
    -- INTEGER-in-base-unit rule as everywhere else.
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_product_components_not_self CHECK (variant_id <> component_variant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_product_components_uniq
  ON pos_product_components (variant_id, component_variant_id);
CREATE INDEX IF NOT EXISTS idx_pos_product_components_variant
  ON pos_product_components (variant_id, sort_order, id);
-- "Where is this stem used?" — the admin needs it before deactivating a variant.
CREATE INDEX IF NOT EXISTS idx_pos_product_components_component
  ON pos_product_components (store_id, component_variant_id);

COMMENT ON TABLE pos_product_components IS
  'Composition of a composite variant (bouquet, tech card). One level deep on purpose: a component may not itself be composite, which makes cycles impossible.';
COMMENT ON COLUMN pos_product_components.quantity IS
  'How much of the component goes in, in the component variant''s own unit. INTEGER, like every other quantity.';
COMMENT ON COLUMN pos_products.stock_mode IS
  'own | derived. Only meaningful for kind=composite: derived reads and writes off the components, own counts the assembled item on its own pos_stock row.';

-- What a sold composite actually consumed, snapshotted per sale line.
--
-- Two reasons this is not re-derived from pos_product_components at refund
-- time: the catalogue composition is editable, so a bouquet refunded next week
-- would return stems it never contained; and an ad-hoc bouquet assembled at the
-- till (TechDocs/POS_VERTICALS.md §6c) has no catalogue composition at all —
-- the only place its recipe exists is the sale. The presence of rows here is
-- also what tells a void/refund to reverse components instead of the variant's
-- own stock, so the reversal cannot disagree with the write-off.
CREATE TABLE IF NOT EXISTS pos_sale_item_components (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    sale_item_id BIGINT NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
    component_variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    -- Per ONE unit of the composite, so a partial refund is exact arithmetic:
    -- returning q units returns q * quantity_per_unit of each component.
    quantity_per_unit INTEGER NOT NULL CHECK (quantity_per_unit > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sale_item_components_uniq
  ON pos_sale_item_components (sale_item_id, component_variant_id);

COMMENT ON TABLE pos_sale_item_components IS
  'Bill of materials actually consumed by one sale line of a derived composite. Written at checkout, read by void/refund.';
