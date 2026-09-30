-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 057_pos_guest_bill.sql
-- A guest at a table sees the bill of THEIR table on the phone
-- (TechDocs/POS_QR_MENU.md, phase Q5). Three columns, and the reason for each:
--
--   pos_tables.qr_key — a random per-table key that the table's QR carries next
--     to the table id (`?t=<id>&k=<key>`). The id alone is a plain integer from
--     one sequence for every store, and the store's URL token is printed on
--     every table, so anyone who has ever scanned any QR could otherwise walk
--     the ids and read other tables' bills. The key is what says «this QR was
--     printed for this table». Filled lazily by the application (a table
--     printed for the first time gets its key then), so this migration writes
--     no data and needs no extension for random bytes.
--
--   pos_stores.public_menu_bill — the owner's switch for showing a guest the
--     bill. Off by default: what a bill shows a guest is the owner's call.
--
--   pos_stores.public_menu_secret — signs the short-lived link the owner's own
--     screens use to open the print pages (`/m/<token>/qr`, `/tables`). Those
--     pages are the only place a table key is ever written out, and they are
--     reachable by the store token — which every guest can see — so they hand
--     keys over only when the request carries a link signed with this secret.
--     Random, created lazily, and cleared when the token is rotated.

ALTER TABLE pos_tables
  ADD COLUMN IF NOT EXISTS qr_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tables_qr_key
  ON pos_tables (qr_key)
  WHERE qr_key IS NOT NULL;

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_bill BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_secret TEXT;

COMMENT ON COLUMN pos_tables.qr_key IS
  'Random key in the table''s QR (?t=<id>&k=<key>): what lets a guest read this table''s bill. NULL until first printed.';
COMMENT ON COLUMN pos_stores.public_menu_bill IS
  'The guest may see the bill of their own table from the QR menu. Off until the owner switches it on.';
COMMENT ON COLUMN pos_stores.public_menu_secret IS
  'Signs the owner''s short-lived print links. Never leaves the server; cleared when the menu token is rotated.';
