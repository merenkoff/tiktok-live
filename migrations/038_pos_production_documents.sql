-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 038_pos_production_documents.sql
-- The stock document that turns components into a composite: the florist
-- assembles ten bouquets in the morning, and each one takes its stems off the
-- shelf and puts an assembled bouquet on it.
-- See TechDocs/POS_VERTICALS.md §7f.
--
-- This is what makes `stock_mode='own'` usable. Its lines name only the
-- composite produced; the component write-off is derived from the composition
-- at post time and recorded in `pos_stock_movements`, which is also what the
-- reversal reads back — so, exactly like a sale, un-assembling returns what was
-- consumed rather than what the recipe says today.

ALTER TABLE pos_stock_documents DROP CONSTRAINT IF EXISTS pos_stock_documents_type_check;
ALTER TABLE pos_stock_documents
  ADD CONSTRAINT pos_stock_documents_type_check
  CHECK (type IN ('receipt', 'writeoff', 'adjustment', 'inventory', 'production'));
