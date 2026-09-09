-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 024_pos_fiscal.sql
-- Ukrainian ПРРО fiscalisation: per-store provider settings, the shift
-- lifecycle, and the fiscal-document ledger. See TechDocs/POS_FISCAL_PRRO.md.
--
-- Phase 1 of the plan creates the schema and the settings surface only; nothing
-- writes to `pos_fiscal_shifts` / `pos_fiscal_receipts` until phases 3 and 4.

-- ── Settings ────────────────────────────────────────────────────────────────
-- Deliberately NOT columns on `pos_stores`: `GET /api/pos/store` is
-- `ensurePosAuth` (ANY seller) and returns the full `mapStore` output, and
-- `getStore` does `SELECT *`. A secret on `pos_stores` would be one careless
-- `mapStore` line away from every cashier's browser.
CREATE TABLE IF NOT EXISTS pos_fiscal_settings (
    store_id BIGINT PRIMARY KEY REFERENCES pos_stores(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    provider VARCHAR(32),
    -- Non-secret, provider-shaped (licence label, cash-register key, base URL…).
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- AES-256-GCM envelope written by src/pos/core/secrets.ts. Never leaves the
    -- backend: the wire shape reports presence as `*_set: boolean`.
    secrets_encrypted BYTEA,
    secrets_key_version SMALLINT,
    -- Store-wide default tax code; `pos_products.fiscal_tax_code` overrides it.
    default_tax_code VARCHAR(16),
    auto_open_shift BOOLEAN NOT NULL DEFAULT TRUE,
    -- v1 has exactly one stance: no fiscal server, no sale. The CHECK is the
    -- record of that decision — widen it when another mode is actually built.
    fail_mode VARCHAR(16) NOT NULL DEFAULT 'block' CHECK (fail_mode IN ('block')),
    -- Which receipt the thermal printer gets. Inert until the phase-8 decision
    -- (our ESC/POS layout vs the provider's pre-rendered text).
    receipt_source VARCHAR(16) NOT NULL DEFAULT 'local'
      CHECK (receipt_source IN ('local', 'provider')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_fiscal_settings_provider_required CHECK (NOT enabled OR provider IS NOT NULL)
);

COMMENT ON COLUMN pos_fiscal_settings.secrets_encrypted IS 'AES-256-GCM envelope [1B ver][12B IV][16B tag][ct], AAD = "<storeId>:<provider>"';
COMMENT ON COLUMN pos_fiscal_settings.receipt_source IS 'Inert until phase 8; adapter returns both structured fields and provider receipt text';

-- ── Shifts ──────────────────────────────────────────────────────────────────
-- ПРРО requires a shift no longer than 24h. `auto_close_due_at` (opened_at +
-- 23h30m) is what the `closeDueShifts` cron scans.
CREATE TABLE IF NOT EXISTS pos_fiscal_shifts (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    -- Which cash register/licence this shift belongs to. Empty string = the
    -- store's only register (the common case); a multi-register store keys by
    -- the provider's own register id.
    cash_register_key TEXT NOT NULL DEFAULT '',
    provider_shift_id TEXT,
    status VARCHAR(16) NOT NULL
      CHECK (status IN ('opening', 'open', 'closing', 'closed', 'error')),
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    auto_close_due_at TIMESTAMPTZ,
    opened_by_staff_id BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    z_report JSONB,
    z_report_text TEXT,
    error_code VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two tills must not open two shifts on one register. The loser of the race
-- catches 23505, re-reads, and proceeds.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiscal_shifts_live
  ON pos_fiscal_shifts (store_id, cash_register_key)
  WHERE status IN ('opening', 'open', 'closing');
CREATE INDEX IF NOT EXISTS idx_pos_fiscal_shifts_due
  ON pos_fiscal_shifts (auto_close_due_at) WHERE status = 'open';

-- ── Fiscal document ledger / outbox ─────────────────────────────────────────
-- One row per fiscal document. Sales, refunds AND service receipts (cash
-- in/out, which have no sale at all) share it, so the ~14 result columns are
-- not duplicated per document kind. The large request/response blobs live here
-- rather than on `pos_sales`, which is read with `SELECT s.*` on every list.
CREATE TABLE IF NOT EXISTS pos_fiscal_receipts (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    doc_type VARCHAR(16) NOT NULL
      CHECK (doc_type IN ('sale', 'refund', 'service_in', 'service_out')),
    -- RESTRICT, matching the house rule the other transactional tables follow:
    -- a fiscalised document must not be deletable in production.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE RESTRICT,
    refund_id BIGINT REFERENCES pos_refunds(id) ON DELETE RESTRICT,
    shift_id BIGINT REFERENCES pos_fiscal_shifts(id) ON DELETE SET NULL,
    provider VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL
      CHECK (status IN ('pending', 'sent', 'done', 'failed', 'abandoned')),
    -- OUR idempotency key, forwarded as the provider's document id. A provider
    -- that already has it answers "duplicate", which the orchestrator treats as
    -- success — this is what stops a timed-out retry double-fiscalising a sale.
    provider_request_id UUID NOT NULL,
    provider_doc_id TEXT,
    fiscal_code TEXT,
    fiscal_date TIMESTAMPTZ,
    tax_url TEXT,
    qr_payload TEXT,
    qr_image_data_url TEXT,
    receipt_text TEXT,
    total_cents INTEGER NOT NULL DEFAULT 0,
    vat_cents INTEGER,
    attempts SMALLINT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    error_code VARCHAR(64),
    error_message TEXT,
    request_payload JSONB,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_fiscal_receipts_ref_shape CHECK (
         (doc_type = 'sale'   AND sale_id IS NOT NULL AND refund_id IS NULL)
      OR (doc_type = 'refund' AND refund_id IS NOT NULL)
      OR (doc_type IN ('service_in', 'service_out') AND sale_id IS NULL AND refund_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_sale
  ON pos_fiscal_receipts (sale_id) WHERE doc_type = 'sale';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_refund
  ON pos_fiscal_receipts (refund_id) WHERE doc_type = 'refund';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_request
  ON pos_fiscal_receipts (store_id, provider_request_id);
CREATE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_retry
  ON pos_fiscal_receipts (next_attempt_at)
  WHERE status IN ('pending', 'sent', 'failed');

COMMENT ON COLUMN pos_fiscal_receipts.provider_request_id IS 'Client-generated document id sent to the provider; the duplicate-detection key';

-- ── Denormalised projection ─────────────────────────────────────────────────
-- The ledger above is the source of truth; this column is a projection of it,
-- written only by fiscal.service.ts in the same transaction as the ledger
-- transition. It exists because `completeSale` must stamp it INSIDE its own
-- transaction: a crash between COMMIT and the fiscalisation call must not leave
-- a fiscalisable sale looking like 'none'. Silently un-fiscalised revenue is
-- the worst failure mode this feature has, and one NOT NULL DEFAULT removes it.
-- It also keeps the receipts list a zero-join query for non-fiscal stores.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_fiscal_status_check;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_fiscal_status_check
  CHECK (fiscal_status IN ('none', 'pending', 'done', 'failed'));

ALTER TABLE pos_refunds ADD COLUMN IF NOT EXISTS fiscal_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE pos_refunds DROP CONSTRAINT IF EXISTS pos_refunds_fiscal_status_check;
ALTER TABLE pos_refunds ADD CONSTRAINT pos_refunds_fiscal_status_check
  CHECK (fiscal_status IN ('none', 'pending', 'done', 'failed'));

CREATE INDEX IF NOT EXISTS idx_pos_sales_fiscal_open
  ON pos_sales (store_id, created_at DESC)
  WHERE fiscal_status IN ('pending', 'failed');

-- ── Per-product tax attributes ──────────────────────────────────────────────
-- On the product, not the variant: VAT is a property of the goods category, so
-- a product's sizes/colours always share it (unlike `compare_at_cents`, which
-- is per-variant because price genuinely varies). Resolution is
-- COALESCE(product.fiscal_tax_code, settings.default_tax_code).
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS fiscal_tax_code VARCHAR(16);
-- Reserved: optional for non-excise goods, which is all a clothing store sells.
-- Created now so a future excise store needs no migration.
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS fiscal_uktzed VARCHAR(32);

COMMENT ON COLUMN pos_products.fiscal_tax_code IS 'Provider tax-rate code; NULL falls back to pos_fiscal_settings.default_tax_code';
COMMENT ON COLUMN pos_products.fiscal_uktzed IS 'УКТЗЕД code; reserved, unused — required only for excise goods';
