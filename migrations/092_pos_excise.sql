-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 092_pos_excise.sql
-- Excise goods and their stamps (track ДК, ДК4-Б, TechDocs/POS_DUAL_REGISTER.md
-- §4.3). A product is excise (beer, alcohol — the 5 % retail excise is added
-- to its receipt line, ДК4-А) and may need a stamp per unit (a bottle sold
-- whole: its stamp's code goes on the receipt, Закон № 265/95-ВР ст. 3 п. 11).
-- Re-runnable: every statement guards itself.

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS fiscal_excise BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS excise_per_unit BOOLEAN NOT NULL DEFAULT false;

-- A stamp per unit only on an excise product.
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_excise_per_unit_check;
ALTER TABLE pos_products
  ADD CONSTRAINT pos_products_excise_per_unit_check
  CHECK (NOT excise_per_unit OR fiscal_excise);

COMMENT ON COLUMN pos_products.fiscal_excise IS
  'Excise goods (beer, alcohol, ДК4): the register''s excise rate is added to the receipt line.';
COMMENT ON COLUMN pos_products.excise_per_unit IS
  'Every unit sold carries its own excise stamp (a bottle sold whole); requires fiscal_excise.';

-- One row per stamp that left (or is about to leave) with the goods. A stamp
-- sits first on a table's bill line (scanned before the round fires), moves
-- to the sale line when the bill is paid, or goes straight onto a till's sale
-- line. A return or a void releases it; while it is not released, the same
-- stamp cannot be sold again in this store.
CREATE TABLE IF NOT EXISTS pos_excise_labels (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- Upper case, single spaces (`src/pos/excise.ts`).
    label VARCHAR(64) NOT NULL,
    bill_item_id BIGINT REFERENCES pos_bill_items(id) ON DELETE SET NULL,
    sale_item_id BIGINT REFERENCES pos_sale_items(id) ON DELETE CASCADE,
    refund_id BIGINT REFERENCES pos_refunds(id) ON DELETE SET NULL,
    released_at TIMESTAMPTZ,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_excise_labels_live
  ON pos_excise_labels (store_id, label)
  WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pos_excise_labels_sale_item
  ON pos_excise_labels (sale_item_id) WHERE sale_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_excise_labels_bill_item
  ON pos_excise_labels (bill_item_id) WHERE bill_item_id IS NOT NULL;
