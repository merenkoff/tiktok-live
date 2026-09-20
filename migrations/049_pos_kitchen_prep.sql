-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 049_pos_kitchen_prep.sql
-- The kitchen's side of the counter: where a paid order is between «paid»
-- and «handed over». See TechDocs/POS_CAFE.md §10 (café phase К3a) and
-- POS_VERTICALS.md §7n.
--
-- Two taps and no clock. `new` is a paid order the kitchen has not finished,
-- `ready` is one waiting on the pickup shelf («Готово»), `served` is one the
-- customer took («Видано»). The board moves an order only through those two
-- taps; nothing on the server moves one by time, because `served_at` means
-- «somebody handed it over», and a sweep that wrote it would make the column
-- mean nothing.
--
-- The default is `served`, deliberately. Every sale made before this
-- migration was handed over at the till, and so is every sale of a store
-- whose vertical has no kitchen (clothing, flowers): `completeSale` writes
-- `new` explicitly, and only for a kitchen vertical, so the partial index
-- below never fills with a boutique's receipts. A sale the desktop till
-- replays after selling offline is stamped `served` as well — the kitchen
-- got a paper ticket for it hours ago, and `new` again would ask for it to
-- be made twice.
--
-- Re-applied on every container start (the runner keeps no tracking table),
-- so everything here is IF NOT EXISTS, and the CHECK is added once.

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS prep_status VARCHAR(16) NOT NULL DEFAULT 'served',
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_sales_prep_status_check'
  ) THEN
    ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_prep_status_check
      CHECK (prep_status IN ('new', 'ready', 'served'));
  END IF;
END $$;

-- Open orders only — the `idx_pos_sales_fiscal_open` shape from 024. The
-- board reads «today's new and ready for this store» every five seconds; a
-- partial index keeps that read the size of the queue, not of the ledger.
CREATE INDEX IF NOT EXISTS idx_pos_sales_kitchen_open
  ON pos_sales (store_id, created_at)
  WHERE prep_status IN ('new', 'ready');

COMMENT ON COLUMN pos_sales.prep_status IS
  'Kitchen flow, two taps: new → ready («Готово») → served («Видано»). served for every sale before 049 and for every sale of a store whose vertical has no kitchen (stamped at sale). Never moved by time.';
COMMENT ON COLUMN pos_sales.ready_at IS
  'When the kitchen tapped «Готово». NULL until then.';
COMMENT ON COLUMN pos_sales.served_at IS
  'When the order was handed over («Видано»), or the sale time for a store without a kitchen and for an offline replay. NULL while the order is on the board.';
