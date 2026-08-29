-- migrations/011_pos_qr_payment.sql
-- QR-code payment: per-store settings on pos_stores + 'qr' payment method.

-- Per-store QR payment configuration (discrete columns, like gtin_lookup_enabled).
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_payment_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_payment_mode TEXT NOT NULL DEFAULT 'static';
ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_qr_payment_mode_check;
ALTER TABLE pos_stores ADD CONSTRAINT pos_stores_qr_payment_mode_check
  CHECK (qr_payment_mode IN ('static', 'dynamic'));
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_static_image_url TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_purpose_template TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_iban TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_edrpou TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS qr_recipient TEXT;

COMMENT ON COLUMN pos_stores.qr_payment_mode IS 'static = cashier shows an uploaded QR image; dynamic = QR generated per sale via provider';
COMMENT ON COLUMN pos_stores.qr_purpose_template IS 'Payment purpose template for dynamic mode; {ref} and {store} placeholders';

-- Allow the 'qr' payment method. Original inline CHECK is auto-named pos_payments_method_check
-- (migrations/002_pos_schema.sql). Drop-then-add is the idempotent idiom (no ADD CONSTRAINT IF NOT EXISTS
-- in Postgres); safe to re-validate because only 'cash'/'card' rows exist.
ALTER TABLE pos_payments DROP CONSTRAINT IF EXISTS pos_payments_method_check;
ALTER TABLE pos_payments ADD CONSTRAINT pos_payments_method_check
  CHECK (method IN ('cash', 'card', 'qr'));

-- Provider invoice id for a QR payment (Opendatabot), used for Phase 3 reconciliation.
ALTER TABLE pos_payments ADD COLUMN IF NOT EXISTS provider_ref TEXT;
