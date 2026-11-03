-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 088_pos_fiscal_registers.sql
-- A second ПРРО in one store (track ДК, TechDocs/POS_DUAL_REGISTER.md §4.1):
-- «Шабля» sells food through one ФОП's Cashalot and alcohol through another
-- ФОП's. Register 1 stays `pos_fiscal_settings`, untouched; every further
-- register is a row here, and a store with none of them does not notice.
--
-- Cashalot only (decision Д5): Checkbox's offline mode, register handover and
-- prepayment chains all assume one register per store. No offline or holder
-- columns for the same reason — a store with a second register runs online.

CREATE TABLE IF NOT EXISTS pos_fiscal_registers (
  store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  register_no SMALLINT NOT NULL CHECK (register_no >= 2),
  label TEXT CHECK (label IS NULL OR char_length(label) <= 60),
  enabled BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'cashalot' CHECK (provider = 'cashalot'),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secrets_encrypted BYTEA,
  secrets_key_version SMALLINT,
  default_tax_code TEXT,
  auto_open_shift BOOLEAN NOT NULL DEFAULT true,
  register_fiscal_number TEXT,
  requisites JSONB,
  requisites_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, register_no)
);

COMMENT ON TABLE pos_fiscal_registers IS
  'Registers 2.. of a store (POS_DUAL_REGISTER.md). Register 1 is pos_fiscal_settings; its shifts run under cash_register_key ''r<N>''.';

-- Every document remembers the register it went through: a retry and a
-- return must go back to THAT register, not to whichever one the store has
-- now. Existing rows are register 1, which they were.
ALTER TABLE pos_fiscal_receipts
  ADD COLUMN IF NOT EXISTS register_no SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN pos_fiscal_receipts.register_no IS
  'The store''s register this document was sent through: 1 = pos_fiscal_settings, N >= 2 = pos_fiscal_registers.';

CREATE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_store_register_status
  ON pos_fiscal_receipts (store_id, register_no, status);
