-- migrations/012_pos_qr_confirmations.sql
-- Phase 3: record when a QR payment was confirmed paid (Opendatabot webhook / reconciliation).

ALTER TABLE pos_payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Webhook / reconciliation match a payment by the provider invoice id.
CREATE INDEX IF NOT EXISTS idx_pos_payments_provider_ref
  ON pos_payments (provider_ref)
  WHERE provider_ref IS NOT NULL;

-- "QR paid but not yet confirmed" lookups (dashboard badge, daily reconciliation).
CREATE INDEX IF NOT EXISTS idx_pos_payments_qr_unconfirmed
  ON pos_payments (created_at)
  WHERE method = 'qr' AND confirmed_at IS NULL;

COMMENT ON COLUMN pos_payments.confirmed_at IS 'When a qr payment was confirmed paid by the provider webhook or daily reconciliation';
