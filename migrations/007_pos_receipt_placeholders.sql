-- migrations/007_pos_receipt_placeholders.sql
-- Placeholder lines on receipt drafts; materialize into products on post

ALTER TABLE pos_stock_document_lines
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_name VARCHAR(255);

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

-- The clothing-shaped placeholder pair and the index keyed on it, guarded
-- because 036 drops both again.
--
-- The runner keeps no tracking table: every migration is re-applied on every
-- container start (Dockerfile CMD). Left bare, `ADD COLUMN IF NOT EXISTS` here
-- resurrects what 036 dropped, 035 swaps the index again, 036 drops the
-- columns again — and each round leaves two `attisdropped` entries behind in
-- pg_attribute, against a hard ceiling of 1600 columns per table.
--
-- `placeholder_attributes` (035) is the marker for "the successor has run":
-- while it is absent, this is a pre-035 database and the old shape is still
-- the real one. The block sits here, after `is_placeholder`, because the
-- index filters on it.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'pos_stock_document_lines'::regclass
       AND attname = 'placeholder_attributes'
       AND NOT attisdropped
  ) THEN
    EXECUTE $sql$
      ALTER TABLE pos_stock_document_lines
        ADD COLUMN IF NOT EXISTS placeholder_size VARCHAR(64) NOT NULL DEFAULT ''
    $sql$;
    EXECUTE $sql$
      ALTER TABLE pos_stock_document_lines
        ADD COLUMN IF NOT EXISTS placeholder_color VARCHAR(64) NOT NULL DEFAULT ''
    $sql$;

    -- Existing UNIQUE(document_id, variant_id) allows multiple NULLs; add stub uniqueness
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_doc_lines_placeholder_uniq
        ON pos_stock_document_lines (
          document_id,
          lower(placeholder_name),
          placeholder_size,
          placeholder_color
        )
        WHERE is_placeholder = TRUE
    $sql$;
  END IF;
END
$guard$;

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS created_from_document_id BIGINT
  REFERENCES pos_stock_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_products_needs_review
  ON pos_products(store_id, needs_review)
  WHERE needs_review = TRUE;
