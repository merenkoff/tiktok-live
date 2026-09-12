-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 030_pos_fiscal_requisites.sql
-- What the provider knows about the store that the paper receipt has to say
-- (Положення № 13, розділ II п. 2): the legal entity (рядки 1, 4/5), the
-- point of sale (2, 3), the register's own number (34) and the tax letters and
-- rates (11, 21). Fetched from the provider while online and cached here, so
-- the owner types nothing and the till can print without a connection
-- (TechDocs/POS_FISCAL_OFFLINE.md, «Фаза 8в»).
--
-- One JSONB block rather than a column per field: it is the provider's view,
-- replaced whole on every refresh. Owner overrides, when they come, get their
-- own columns rather than editing this one.

ALTER TABLE pos_fiscal_settings
  ADD COLUMN IF NOT EXISTS requisites JSONB,
  ADD COLUMN IF NOT EXISTS requisites_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_fiscal_settings.requisites IS
  'FiscalRequisites as the provider last reported them: organization, point, register, taxes.';
