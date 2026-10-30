-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 080_pos_public_menu_slug.sql
-- «Коротка адреса»: the guest menu may also answer at /m/<slug> — the store
-- code the till logs in with — for a link in a social-network bio, where
-- `the-live.shop/m/shablya` reads and `/m/tbJbbIZXeM_czLnJLOqxzIBH` does not.
-- TechDocs/POS_QR_MENU.md, «Коротка адреса».
--
-- 056 kept the slug out of the address on purpose: it is the store half of
-- the till's PIN login. So this is the owner's switch, off by default, and
-- the token address and every printed QR keep working beside it.
--
-- The first store to ask for it, «Шабля» (`shablya`), gets it switched on —
-- together with the menu itself, which it had not published yet, and a token
-- so the owner's card shows the usual address and print buttons too. ONCE:
-- only on the boot that adds the column. Every file here is re-applied on
-- every boot, and an owner who later unticks the box must not find it ticked
-- again after the next deploy.

DO $slug$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'pos_stores'
       AND column_name = 'public_menu_slug_enabled'
  ) THEN
    ALTER TABLE pos_stores
      ADD COLUMN public_menu_slug_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    -- EXECUTE, so the statement is planned after the column exists.
    EXECUTE $u$
      UPDATE pos_stores
         SET public_menu_slug_enabled = TRUE,
             public_menu_enabled = TRUE,
             public_menu_token = COALESCE(public_menu_token, replace(gen_random_uuid()::text, '-', '')),
             updated_at = NOW()
       WHERE slug = 'shablya'
         AND vertical = 'cafe'
         AND NOT EXISTS (SELECT 1 FROM pos_stores other WHERE other.public_menu_token = 'shablya')
    $u$;
  END IF;
END
$slug$;

COMMENT ON COLUMN pos_stores.public_menu_slug_enabled IS
  'The guest menu also answers at /m/<slug> (a short link for social networks). Off by default: the slug is half of the till login.';
