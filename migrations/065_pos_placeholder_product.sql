-- migrations/065_pos_placeholder_product.sql
-- A receipt stub that names an EXISTING card (clothing S1, prihід матрицею —
-- TechDocs/POS_CLOTHING.md).
--
-- A placeholder line used to become its own product with one variant when the
-- document was posted, so five stubs «Боді» in five sizes became five cards.
-- Posting now groups the stubs of one document by name into ONE product, and a
-- stub carrying `placeholder_product_id` becomes a variant of THAT card instead
-- of a new one — a new size on a card the shop already has, drawn in the
-- receiving grid and created only when the receipt is posted, like every
-- other stub. ON DELETE SET NULL: a card removed while the draft waits turns
-- the stub back into «a new product named …», which posting handles.
--
-- The dedup key gains the card: a children's shop has dozens of cards that
-- share a name, and two «Боді» with a new 86 in one receipt must not collide.
-- `035` creates the old index on every boot; it is guarded there by this
-- column's presence, so the pair does not drop and re-create each other.
--
-- Re-runnable: the migration runner applies every file on every boot.

ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_product_id BIGINT
    REFERENCES pos_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_stock_doc_lines_placeholder_product
  ON pos_stock_document_lines (placeholder_product_id)
  WHERE placeholder_product_id IS NOT NULL;

DROP INDEX IF EXISTS idx_pos_stock_doc_lines_placeholder_attr_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_doc_lines_placeholder_key_uniq
  ON pos_stock_document_lines (
    document_id,
    lower(placeholder_name),
    COALESCE(placeholder_product_id, 0),
    placeholder_attributes
  )
  WHERE is_placeholder = TRUE;
