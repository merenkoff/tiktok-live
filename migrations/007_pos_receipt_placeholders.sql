-- migrations/007_pos_receipt_placeholders.sql
-- Placeholder lines on receipt drafts; materialize into products on post

ALTER TABLE pos_stock_document_lines
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_name VARCHAR(255);

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_size VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_color VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_barcode VARCHAR(64);

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_price_cents INTEGER
  CHECK (placeholder_price_cents IS NULL OR placeholder_price_cents >= 0);

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_stock_document_lines
  DROP CONSTRAINT IF EXISTS pos_stock_document_lines_variant_or_placeholder;

ALTER TABLE pos_stock_document_lines
  ADD CONSTRAINT pos_stock_document_lines_variant_or_placeholder CHECK (
    (is_placeholder = FALSE AND variant_id IS NOT NULL)
    OR (
      is_placeholder = TRUE
      AND variant_id IS NULL
      AND placeholder_name IS NOT NULL
      AND length(trim(placeholder_name)) > 0
      AND placeholder_price_cents IS NOT NULL
    )
  );

-- Existing UNIQUE(document_id, variant_id) allows multiple NULLs; add stub uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_doc_lines_placeholder_uniq
  ON pos_stock_document_lines (
    document_id,
    lower(placeholder_name),
    placeholder_size,
    placeholder_color
  )
  WHERE is_placeholder = TRUE;

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS created_from_document_id BIGINT
  REFERENCES pos_stock_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_products_needs_review
  ON pos_products(store_id, needs_review)
  WHERE needs_review = TRUE;
