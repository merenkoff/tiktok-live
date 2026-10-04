-- migrations/064_pos_exchange.sql
-- Exchange, defective returns and the refund's own facts
-- (clothing, TechDocs/POS_CLOTHING.md R1/R2/R4).
--
-- An exchange under ПРРО is TWO fiscal documents — a return receipt (ФКЧ-2)
-- for what came back and a sale receipt for what left — never one receipt for
-- the difference. So an exchange is a `pos_refunds` row plus a `pos_sales`
-- row written in one transaction, and `pos_sales.exchange_refund_id` is the
-- link that lets the till and the owner's list show them as one operation.
--
-- `reason_code` is the ground the customer named (ст. 8/9 ЗУ «Про захист
-- прав споживачів»); `defect` is the one that changes what happens to the
-- goods — they do not go back on the shelf — and `writeoff_document_id` is
-- the posted write-off that took them off again in the same transaction.
-- `buyer_name` / `buyer_document` are for the «Акт про видачу коштів» that
-- Порядок № 547 (розд. ІІІ п. 8) wants when more than 100 ₴ is handed back.
--
-- Re-runnable: the migration runner applies every file on every boot.

ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS reason_code VARCHAR(16);
ALTER TABLE pos_refunds DROP CONSTRAINT IF EXISTS pos_refunds_reason_code_check;
ALTER TABLE pos_refunds ADD CONSTRAINT pos_refunds_reason_code_check
  CHECK (reason_code IS NULL OR reason_code IN ('size', 'color', 'style', 'defect', 'other'));

ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS buyer_document TEXT;

-- SET NULL, not RESTRICT: a store teardown deletes documents after refunds,
-- and a write-off the owner later removes must not pin the refund.
ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS writeoff_document_id BIGINT
  REFERENCES pos_stock_documents(id) ON DELETE SET NULL;

-- The refund this sale is the second half of. SET NULL for the same reason:
-- `pos_refunds` rows go before `pos_sales` rows when a store is dropped.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS exchange_refund_id BIGINT
  REFERENCES pos_refunds(id) ON DELETE SET NULL;

-- One live exchange sale per refund. A sale voided because ПРРО refused its
-- receipt frees the slot — the refund stands and the goods are rung again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_exchange_refund
  ON pos_sales (exchange_refund_id)
  WHERE exchange_refund_id IS NOT NULL AND status <> 'voided';

-- The owner's summary counts a refund on the day it happened (ПКУ 292.11:
-- a single-tax payer's income drops in the period of the return).
CREATE INDEX IF NOT EXISTS idx_pos_refunds_store_created
  ON pos_refunds (store_id, created_at);

COMMENT ON COLUMN pos_refunds.reason_code IS
  'Why the goods came back: size | color | style | defect | other; defect writes them off instead of restocking';
COMMENT ON COLUMN pos_refunds.buyer_name IS
  'Buyer named on the «Акт про видачу коштів» (Порядок № 547 розд. ІІІ п. 8, refunds over 100 ₴)';
COMMENT ON COLUMN pos_refunds.buyer_document IS
  'The buyer''s identity document as typed by the cashier, for the same act';
COMMENT ON COLUMN pos_refunds.writeoff_document_id IS
  'Posted write-off made in the refund''s transaction when reason_code = defect';
COMMENT ON COLUMN pos_sales.exchange_refund_id IS
  'Set on the sale half of an exchange: the refund of the goods that came back';
