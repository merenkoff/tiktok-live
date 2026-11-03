-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 089_pos_fiscal_register_routing.sql
-- Which register a product is sold through, and which one a sale went to
-- (track ДК, TechDocs/POS_DUAL_REGISTER.md §4.2). «Шабля»'s alcohol goes
-- through the other ФОП's register 2, its food through register 1.

-- NULL = register 1. Honoured only while that register is switched on, so
-- switching register 2 off sends everything back to register 1 and breaks
-- nothing (src/pos/fiscal/routing.ts).
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS fiscal_register SMALLINT;

ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_fiscal_register_check;
ALTER TABLE pos_products
  ADD CONSTRAINT pos_products_fiscal_register_check
  CHECK (fiscal_register IS NULL OR fiscal_register IN (1, 2));

COMMENT ON COLUMN pos_products.fiscal_register IS
  'The store register this product is sold through (POS_DUAL_REGISTER.md): NULL or 1 = register 1, 2 = pos_fiscal_registers row 2.';

-- The register a sale is fiscalised through, fixed when it is written: the
-- orphan pass and a refund need it before (or without) a ledger document.
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS fiscal_register SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN pos_sales.fiscal_register IS
  'The store register this sale is fiscalised through (1 = pos_fiscal_settings, 2.. = pos_fiscal_registers).';
