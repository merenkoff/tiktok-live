-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 035_pos_variant_attributes.sql
-- The product model stops being clothing-shaped: `size`/`color` become a
-- vertical-defined `attributes` bag, with the one-line variant caption stored
-- next to it and the unit of quantity named explicitly.
-- See TechDocs/POS_VERTICALS.md.
--
-- Additive on purpose — the old columns stay until 036. Migrations run before
-- the new image is live, so for a minute a 1.x backend serves `SELECT v.size`
-- against this schema; dropping here would 500 every catalog request in that
-- window. 036 re-runs the backfill (for rows that minute may have written) and
-- only then drops.
--
-- `label` is derived but stored: sales, receipts, the ПРРО document, analytics
-- and every stock report already read one denormalised string, and searching,
-- ordering and de-duplicating on a plain text column is what keeps them simple.
-- The services recompute it from the store's vertical on every variant write.

ALTER TABLE pos_variants
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS label      text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit       text  NOT NULL DEFAULT 'шт';

-- Exactly the pre-verticals clothing rule (`[color, size].filter(Boolean)
-- .join(' / ')`, sales.service.ts), so no existing shop sees a caption change.
UPDATE pos_variants
   SET attributes = jsonb_strip_nulls(
         jsonb_build_object('size', NULLIF(size, ''), 'color', NULLIF(color, ''))
       ),
       label = concat_ws(' / ', NULLIF(color, ''), NULLIF(size, ''))
 WHERE attributes = '{}'::jsonb
   AND label = ''
   AND (size <> '' OR color <> '');

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS placeholder_label      text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS placeholder_unit       text  NOT NULL DEFAULT 'шт';

UPDATE pos_stock_document_lines
   SET placeholder_attributes = jsonb_strip_nulls(
         jsonb_build_object(
           'size', NULLIF(placeholder_size, ''),
           'color', NULLIF(placeholder_color, '')
         )
       ),
       placeholder_label = concat_ws(
         ' / ', NULLIF(placeholder_color, ''), NULLIF(placeholder_size, '')
       )
 WHERE is_placeholder = TRUE
   AND placeholder_attributes = '{}'::jsonb
   AND placeholder_label = ''
   AND (placeholder_size <> '' OR placeholder_color <> '');

-- The 007 index keyed on the (name, size, color) tuple. New code writes '' into
-- both old columns, so two genuinely different placeholders would collide on
-- it. jsonb has a btree opclass, so the normalised attribute bag — canonical by
-- construction (`normalizeAttributes`) — is the same key, one column over.
DROP INDEX IF EXISTS idx_pos_stock_doc_lines_placeholder_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_doc_lines_placeholder_attr_uniq
  ON pos_stock_document_lines (document_id, lower(placeholder_name), placeholder_attributes)
  WHERE is_placeholder = TRUE;

-- Snapshot next to `variant_label`: a receipt reprinted next year must say what
-- was sold in the unit it was sold in, whatever the variant looks like by then.
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'шт';

-- Reserved, not yet used: a bouquet (flowers) and a dish (café) are both a
-- product assembled from components that are written off when it sells.
-- TechDocs/POS_VERTICALS.md §5.
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'simple';
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_kind_check;
ALTER TABLE pos_products
  ADD CONSTRAINT pos_products_kind_check CHECK (kind IN ('simple', 'composite'));

COMMENT ON COLUMN pos_variants.attributes IS
  'Vertical-defined attributes (schema: src/pos/verticals). Normalised on write: schema keys only, canonical order.';
COMMENT ON COLUMN pos_variants.label IS
  'Derived by VerticalDefinition.labelOf on every write — the one caption sales, receipts, ПРРО and reports read.';
COMMENT ON COLUMN pos_variants.unit IS
  'Base unit of quantity (шт/г/мл/м). quantity stays INTEGER counted in this unit.';
COMMENT ON COLUMN pos_products.kind IS
  'simple | composite. Composite (bouquets, tech cards) is reserved — nothing creates one yet.';
