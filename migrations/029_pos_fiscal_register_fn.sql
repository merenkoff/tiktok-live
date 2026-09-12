-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 029_pos_fiscal_register_fn.sql
-- The ПРРО's own fiscal number (ФН ПРРО), remembered from the provider.
--
-- Needed to build the tax-office verification link ourselves for a receipt
-- stamped while the provider was unreachable. That link is
--   /cashregs/check?id=<receipt fiscal number>&date=&time=&fn=<THIS>&sm=
-- and every other part of it the till already knows at the moment of sale.
-- Verified against a real receipt: the cabinet finds the document by these
-- five, no `mac` needed (TechDocs/POS_FISCAL_OFFLINE.md, «Открытые вопросы»).
--
-- A register-level constant, so it is cached rather than asked for per sale:
-- the provider hands it back on every `registerState()` call, and offline —
-- when we need it most — there is nobody to ask.

ALTER TABLE pos_fiscal_settings
  ADD COLUMN IF NOT EXISTS register_fiscal_number VARCHAR(64);

COMMENT ON COLUMN pos_fiscal_settings.register_fiscal_number IS
  'ФН ПРРО as the provider reports it; the `fn` of the tax-office check link.';
