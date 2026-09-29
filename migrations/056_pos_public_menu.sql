-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 056_pos_public_menu.sql
-- The guest's menu: a page a customer opens by scanning a QR on the counter,
-- with prices, sizes, modifiers and the day's stop-list. TechDocs/POS_QR_MENU.md.
--
-- Two columns on the store, and the reason for each:
--
--   public_menu_enabled — the owner's switch. Off by default: publishing a
--     price list is the owner's call, not a side effect of a deploy.
--
--   public_menu_token — the ONLY thing the public URL carries (/m/<token>).
--     Deliberately not `pos_stores.slug`: the slug is the store half of the
--     till's PIN login, so printing it on every table would hand out half of
--     the credential. The token is random (18 bytes, base64url), issued the
--     first time the owner switches the menu on, and rotatable when a QR
--     leaks into the wrong hands. It is NULL until then, and the unique index
--     is partial for that reason.
--
-- The demo cafés get a fixed, well-known token so the marketing site can link
-- to a live menu. Guarded on `public_menu_token IS NULL`, which every store
-- is on the deploy that adds the column — afterwards an owner's rotation or
-- switch-off sticks, because a stamped store is never touched again. (Every
-- file here is re-applied on every boot; this guard is what makes that safe.)

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_stores_public_menu_token
  ON pos_stores (public_menu_token)
  WHERE public_menu_token IS NOT NULL;

COMMENT ON COLUMN pos_stores.public_menu_enabled IS
  'The guest menu at /m/<public_menu_token> is published. Off until the owner switches it on.';
COMMENT ON COLUMN pos_stores.public_menu_token IS
  'Random URL key of the guest menu. Never the slug: the slug is half of the till login. NULL until first enabled; rotating it retires every printed QR.';

UPDATE pos_stores
   SET public_menu_token = 'demo-cafe-menu',
       public_menu_enabled = TRUE
 WHERE slug = 'demo-cafe' AND public_menu_token IS NULL;

UPDATE pos_stores
   SET public_menu_token = 'demo-restaurant-menu',
       public_menu_enabled = TRUE
 WHERE slug = 'demo-restaurant' AND public_menu_token IS NULL;
