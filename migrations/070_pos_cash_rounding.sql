-- migrations/070_pos_cash_rounding.sql
-- Cash rounding (Постанова НБУ від 15.03.2018 № 25, пп. 4, 4-1, 5, 6;
-- TechDocs/POS_CASH_ROUNDING.md).
--
-- A shop without small coins rounds the CASH total of a receipt — to 10
-- kopecks (п. 4) or, without 10-kopeck coins, to 50 (п. 4-1) — and the
-- document of a cash refund the same way; card and QR are never rounded
-- (п. 6). The law makes it conditional on the coins the shop has, so it is
-- the owner's setting and starts switched off for every store.
--
-- `total_cents` keeps meaning what the goods came to: fiscal lines, refunds,
-- VAT and analytics all stand on it. The rounding is its own signed column
-- next to it (the amount due is `total_cents + rounding_cents`), with the
-- step it was computed by — a fiscal retry hours later must tell the provider
-- ROUND_10 or ROUND_50, and the store's setting may have changed since.
--
-- Re-runnable: the migration runner applies every file on every boot.

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS cash_rounding SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_cash_rounding_check;
ALTER TABLE pos_stores ADD CONSTRAINT pos_stores_cash_rounding_check
  CHECK (cash_rounding IN (0, 10, 50));

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS cash_rounding SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS rounding_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_cash_rounding_check;
-- −24…+25: the widest the 50-kopeck rule can move a sum (1–24 down, 25–49 up).
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_cash_rounding_check
  CHECK (
    cash_rounding IN (0, 10, 50)
    AND rounding_cents BETWEEN -24 AND 25
    AND (cash_rounding <> 0 OR rounding_cents = 0)
  );

ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS cash_rounding SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS rounding_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pos_refunds DROP CONSTRAINT IF EXISTS pos_refunds_cash_rounding_check;
ALTER TABLE pos_refunds ADD CONSTRAINT pos_refunds_cash_rounding_check
  CHECK (
    cash_rounding IN (0, 10, 50)
    AND rounding_cents BETWEEN -24 AND 25
    AND (cash_rounding <> 0 OR rounding_cents = 0)
  );

COMMENT ON COLUMN pos_stores.cash_rounding IS
  'Cash totals rounded to this many kopecks (НБУ № 25: 10 = п. 4, 50 = п. 4-1); 0 = not rounded';
COMMENT ON COLUMN pos_sales.cash_rounding IS
  'The rounding step the till used for this receipt''s cash part (0, 10, 50)';
COMMENT ON COLUMN pos_sales.rounding_cents IS
  'Signed rounding of the cash part; the amount due is total_cents + rounding_cents';
COMMENT ON COLUMN pos_refunds.cash_rounding IS
  'The rounding step used for a cash refund (0, 10, 50)';
COMMENT ON COLUMN pos_refunds.rounding_cents IS
  'Signed rounding of a cash refund; the cash handed back is total_cents + rounding_cents';
