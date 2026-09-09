-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- Roadmap #12 track 3: a count sheet rung up on the (possibly offline) till is
-- submitted as ONE idempotent request that creates a draft `inventory`
-- document. The client-generated UUID is what makes a retried submission
-- return the same document instead of a second one — same mechanism as
-- `pos_sales.client_uuid` (010_pos_offline_sync.sql).

ALTER TABLE pos_stock_documents
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stock_documents_store_client_uuid
  ON pos_stock_documents (store_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN pos_stock_documents.client_uuid IS
  'Client-generated UUID for idempotent offline submission (till count sheets)';
