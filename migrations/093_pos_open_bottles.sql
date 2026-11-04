-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 093_pos_open_bottles.sql
-- Open bottles (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md §4.4). A pour —
-- a shot of vodka, a glass of wine, a cocktail — takes millilitres from the
-- bottle the bar has open, and the tax office wants that bottle's excise
-- stamp on the receipt of the FIRST sale from it (ДПС ІПК № 3349 of
-- 06.09.2021, З2). Stock stays one number of millilitres per variant (Д3):
-- a bottle here only counts what was poured from it.
-- Re-runnable: every statement guards itself.

-- A variant that opens by its stamp, and how much one bottle holds (Д10: its
-- own field, not the receiving pack, which may be a case of six).
ALTER TABLE pos_variants ADD COLUMN IF NOT EXISTS bottle_ml INTEGER;
ALTER TABLE pos_variants DROP CONSTRAINT IF EXISTS pos_variants_bottle_ml_check;
ALTER TABLE pos_variants
  ADD CONSTRAINT pos_variants_bottle_ml_check
  CHECK (bottle_ml IS NULL OR (bottle_ml > 0 AND bottle_ml <= 100000));

COMMENT ON COLUMN pos_variants.bottle_ml IS
  'Poured by the millilitre from a bottle opened by its excise stamp (ДК5); the bottle''s size in ml.';

-- One row per bottle the bar opened. At most one open per variant: every
-- pour of that variant comes out of it until its count reaches its size.
CREATE TABLE IF NOT EXISTS pos_open_bottles (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    -- The stamp as stored in `pos_excise_labels` (upper case, single spaces).
    label VARCHAR(64) NOT NULL,
    capacity_ml INTEGER NOT NULL CHECK (capacity_ml > 0),
    poured_ml INTEGER NOT NULL DEFAULT 0,
    -- True while no standing receipt carries the stamp yet: the next pour
    -- from this bottle carries it.
    label_pending BOOLEAN NOT NULL DEFAULT TRUE,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_by BIGINT,
    closed_at TIMESTAMPTZ,
    closed_by BIGINT,
    close_reason VARCHAR(16),
    -- What the count says was still in it when it was closed early, in ml.
    discrepancy_ml INTEGER,
    note TEXT,
    CONSTRAINT pos_open_bottles_poured_check CHECK (poured_ml >= 0 AND poured_ml <= capacity_ml),
    CONSTRAINT pos_open_bottles_close_check
      CHECK (close_reason IS NULL OR close_reason IN ('empty', 'replaced', 'broken'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_open_bottles_live
  ON pos_open_bottles (store_id, variant_id)
  WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pos_open_bottles_store_opened
  ON pos_open_bottles (store_id, opened_at DESC);

-- A bottle's stamp is a stamp like a whole bottle's: one row in
-- `pos_excise_labels`, never released once the bottle is open, so the same
-- stamp cannot also be sold as a whole bottle.
ALTER TABLE pos_excise_labels
  ADD COLUMN IF NOT EXISTS open_bottle_id BIGINT REFERENCES pos_open_bottles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pos_excise_labels_open_bottle
  ON pos_excise_labels (open_bottle_id) WHERE open_bottle_id IS NOT NULL;

-- Who poured how much from which bottle. A pour that spans the end of one
-- bottle and the start of the next is two rows. `bottle_id` NULL is a pour
-- waiting for the bar to scan the next bottle's stamp (a table's round, Д18,
-- or a sale the desktop rang offline). `carries_label` marks the pour whose
-- receipt line carries the bottle's stamp.
CREATE TABLE IF NOT EXISTS pos_bottle_pours (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    bottle_id BIGINT REFERENCES pos_open_bottles(id) ON DELETE CASCADE,
    sale_item_id BIGINT REFERENCES pos_sale_items(id) ON DELETE CASCADE,
    bill_item_id BIGINT REFERENCES pos_bill_items(id) ON DELETE SET NULL,
    ml INTEGER NOT NULL CHECK (ml > 0),
    carries_label BOOLEAN NOT NULL DEFAULT FALSE,
    -- The return whose receipt carries the stamp back, when the line that
    -- carried it came back whole.
    refund_id BIGINT REFERENCES pos_refunds(id) ON DELETE SET NULL,
    undone_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_bottle_pours_sale_item
  ON pos_bottle_pours (sale_item_id) WHERE sale_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_bottle_pours_bill_item
  ON pos_bottle_pours (bill_item_id) WHERE bill_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_bottle_pours_bottle
  ON pos_bottle_pours (bottle_id) WHERE bottle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_bottle_pours_waiting
  ON pos_bottle_pours (store_id, variant_id, id)
  WHERE bottle_id IS NULL AND undone_at IS NULL;
