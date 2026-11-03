-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 091_pos_fiscal_tax_rows.sql
-- Every tax row a fiscal document registered — VAT and the 5 % retail excise
-- on alcohol and beer (track ДК, ДК4, TechDocs/POS_DUAL_REGISTER.md): the
-- receipt prints «ПДВ А 20 %» and «Акциз Г 5 %» as the tax office was told,
-- not as the till would recompute them (the same reason `vat_cents` exists).
-- NULL for a document stored before, and for a provider that reports none.

ALTER TABLE pos_fiscal_receipts ADD COLUMN IF NOT EXISTS tax_rows JSONB;

COMMENT ON COLUMN pos_fiscal_receipts.tax_rows IS
  'CHECKTAX as registered: [{kind: vat|excise, name, letter, rate, amount_cents}] (ДК4); NULL when unknown.';
