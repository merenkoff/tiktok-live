-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 026_pos_fiscal_receipt_width.sql
-- Phase 8a of TechDocs/POS_FISCAL_PRRO.md: `receipt_source='provider'` goes
-- live. The provider renders its receipt text at a fixed character width, and
-- that render is fetched once, server-side, at fiscalisation time — where no
-- till's paper-width setting is in reach (the retry cron has no till at all).
-- So the width is a store setting. 32 = 58mm roll, 48 = 80mm; 32 is the
-- default because a narrow render prints legibly on either roll.
ALTER TABLE pos_fiscal_settings
    ADD COLUMN IF NOT EXISTS receipt_width SMALLINT NOT NULL DEFAULT 32;

ALTER TABLE pos_fiscal_settings
    DROP CONSTRAINT IF EXISTS pos_fiscal_settings_receipt_width_check;
ALTER TABLE pos_fiscal_settings
    ADD CONSTRAINT pos_fiscal_settings_receipt_width_check CHECK (receipt_width IN (32, 48));

COMMENT ON COLUMN pos_fiscal_settings.receipt_width IS 'Characters per line for provider-rendered receipt text: 32 = 58mm roll, 48 = 80mm';
COMMENT ON COLUMN pos_fiscal_settings.receipt_source IS 'local = our ESC/POS layout + fiscal block; provider = the provider''s pre-rendered text, fetched at receipt_width';
