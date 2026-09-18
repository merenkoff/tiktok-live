-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 047_pos_sale_order_no.sql
-- The order number: «сорок два!», not «R-2026-000317».
-- See TechDocs/POS_CAFE.md §3–§4.9 (café phase К1g).
--
-- A receipt number is a fiscal-grade identity: unique for the life of the
-- store, printed small, never said aloud. A counter-service café needs the
-- other thing — a short number the barista calls across the room and the
-- customer remembers for ninety seconds. So: a per-store counter that starts
-- at 1 every day (the store's own day, `pos_stores.timezone`), assigned inside
-- the sale's transaction right after the receipt number, so a rolled-back
-- sale rolls its number back too and a `client_uuid` replay returns the row
-- it already made — the same number, printed once.
--
-- NULL on every sale made before this migration and on nothing after it:
-- every store gets one, whatever it sells, and the till decides whether to
-- show it (a florist's receipt has no use for «№ 42»; a café's success screen
-- is nothing but it). A sale the desktop till stamped offline is numbered on
-- the day it syncs — its OFF- receipt cannot show a number this server has
-- not issued yet; a local one on the desktop is К3.

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS order_no INTEGER NULL;

COMMENT ON COLUMN pos_sales.order_no IS
  'Short daily order number (1, 2, 3… restarting each store-local day), for calling an order at the counter. NULL before migration 047. Not the receipt number.';
