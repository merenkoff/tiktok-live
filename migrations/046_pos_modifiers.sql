-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 046_pos_modifiers.sql
-- Modifiers: «oat milk +15», «no sugar», «extra shot» — a choice made on the
-- sale line, part of the order and part of the write-off at once.
-- See TechDocs/POS_CAFE.md §3–§4 and §9 (café phase К1e–f), POS_VERTICALS.md §7k.
--
-- A group is a question the till asks («Молоко?»), with how many answers it
-- takes (`min_select`..`max_select`: 1..1 is a required single choice, 0..3 an
-- optional multi-pick). A modifier is one answer: a name, a price delta, and
-- optionally what it writes off — any variant, a syrup portion that is itself
-- a recipe included, so «caramel +10» takes sugar and water off the shelf the
-- same way the latte's own recipe does. A modifier with no component is the
-- Poster «без списання» kind: «гарячіше», «без цукру».
--
-- Groups hang off the PRODUCT (S / M / L share the same milk options), and a
-- product's set of groups is replaced wholesale, like tags.
--
-- The price delta may be NEGATIVE («пів порції −15») — businesses differ, and
-- the constraint belongs on the result: a line's price after its deltas may
-- not go below zero, which checkout refuses. `compare_at` shifts by the same
-- sum so the receipt's discount stays what it was.
--
-- What a sale line chose is SNAPSHOTTED into `pos_sale_item_modifiers` (names
-- and deltas — a group renamed next week must not rewrite a printed receipt),
-- and what those modifiers wrote off lands in `pos_sale_item_components` next
-- to the recipe's own leaves, so a refund stays exact arithmetic. The composed
-- caption («M · вівсяне молоко») goes into `pos_sale_items.variant_label`,
-- which is how the ПРРО line, the receipt, the Rust printer, the refund screen
-- and analytics pick modifiers up without a change. The kitchen note does NOT:
-- «без цибулі, алергія» is for the kitchen ticket, never for a fiscal receipt.

CREATE TABLE IF NOT EXISTS pos_modifier_groups (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
    max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_modifier_groups_range CHECK (max_select >= min_select)
);
CREATE INDEX IF NOT EXISTS idx_pos_modifier_groups_store
  ON pos_modifier_groups (store_id, sort_order, id);

CREATE TABLE IF NOT EXISTS pos_modifiers (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    -- Signed on purpose; see the header.
    price_delta_cents INTEGER NOT NULL DEFAULT 0,
    -- What choosing this writes off, if anything. NO ACTION, like a recipe
    -- component: a variant a modifier still points at cannot be deleted.
    component_variant_id BIGINT NULL REFERENCES pos_variants(id),
    -- In the component's own unit, per one unit of the product, whole.
    component_quantity INTEGER NULL CHECK (component_quantity > 0),
    -- Pre-selected on the till so «як завжди» is one tap. A hint to the UI
    -- only: the server never applies it to a line that names no modifiers.
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_modifiers_component_pair
      CHECK ((component_variant_id IS NULL) = (component_quantity IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pos_modifiers_group
  ON pos_modifiers (group_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_pos_modifiers_component
  ON pos_modifiers (store_id, component_variant_id);

CREATE TABLE IF NOT EXISTS pos_product_modifier_groups (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_product_modifier_groups_group
  ON pos_product_modifier_groups (group_id);

CREATE TABLE IF NOT EXISTS pos_sale_item_modifiers (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    sale_item_id BIGINT NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
    -- Kept for reports while the modifier exists; the names below are the
    -- record once it is gone.
    modifier_id BIGINT NULL REFERENCES pos_modifiers(id) ON DELETE SET NULL,
    group_name VARCHAR(80) NOT NULL,
    name VARCHAR(80) NOT NULL,
    price_delta_cents INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_item_modifiers_item
  ON pos_sale_item_modifiers (sale_item_id, sort_order, id);

-- The kitchen note. Never part of the caption.
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS note VARCHAR(120) NOT NULL DEFAULT '';

COMMENT ON TABLE pos_modifier_groups IS
  'A question the till asks about a product («Молоко?») and how many answers it takes.';
COMMENT ON TABLE pos_modifiers IS
  'One answer: name, signed price delta, optional write-off (any variant, a recipe included).';
COMMENT ON TABLE pos_product_modifier_groups IS
  'Which groups a product asks, in order. Per product: sizes share them.';
COMMENT ON TABLE pos_sale_item_modifiers IS
  'What a sale line chose, snapshotted by name and delta. Its write-off is in pos_sale_item_components.';
COMMENT ON COLUMN pos_sale_items.note IS
  'Kitchen note for this line. Printed on the kitchen ticket and shown on the board; never on the fiscal receipt.';
