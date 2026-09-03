-- Refunds as first-class documents.
--
-- Under ПРРО a fiscalised receipt is never "cancelled" — a separate refund
-- document is issued against it. So a refund needs its own identity now:
-- an idempotency key, its own number, and the method the money went back by.

ALTER TABLE pos_refunds
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_refunds_store_client_uuid
  ON pos_refunds (store_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

ALTER TABLE pos_refunds
  ADD COLUMN IF NOT EXISTS refund_number TEXT;

ALTER TABLE pos_refunds
  ADD COLUMN IF NOT EXISTS method VARCHAR(16);

-- Same set as pos_payments (see 011_pos_qr_payment.sql). Nullable: rows written
-- before this migration have no recorded method and must stay valid.
ALTER TABLE pos_refunds DROP CONSTRAINT IF EXISTS pos_refunds_method_check;
ALTER TABLE pos_refunds ADD CONSTRAINT pos_refunds_method_check
  CHECK (method IS NULL OR method IN ('cash', 'card', 'qr'));

COMMENT ON COLUMN pos_refunds.client_uuid IS 'Client-generated UUID for refund idempotency';
COMMENT ON COLUMN pos_refunds.refund_number IS 'Document number, RF-00001 — refunds number separately from sales';
COMMENT ON COLUMN pos_refunds.method IS 'How the money was returned; NULL on rows predating the column';
