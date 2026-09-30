-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 059_pos_store_public_profile.sql
-- What the guest's menu says about the place itself (TechDocs/POS_QR_MENU.md,
-- phase Q3a): a logo, an address, a phone number and the opening hours. Until
-- now the page's header was the store's name and nothing else, and `pos_stores`
-- had nowhere to keep any of it (the fiscal requisites are a provider's cache,
-- not the owner's words, and the payment-QR columns are for payments).
--
--   public_logo_url — a `/pos-uploads/<file>` path this backend issued. Written
--     only through the owner's profile endpoint, which refuses any other shape,
--     and read through `safeImageUrl` all the same.
--
--   public_address, public_phone — plain text as the owner typed it; the page
--     builds the map link and the `tel:` link itself from them.
--
--   public_hours — `{ "1": {"open":"08:00","close":"22:00"}, … "7": … }`, keys
--     1 (Monday) to 7 (Sunday), a missing day meaning closed; a `close` at or
--     before `open` runs past midnight. NULL means the owner has said nothing,
--     which the page shows as nothing rather than as «зачинено».
--
-- Every column is nullable, so a store that never opens the new card is
-- untouched. All of it is re-runnable: the runner applies this file on every
-- boot.

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_logo_url TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_address VARCHAR(200);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_phone VARCHAR(32);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_hours JSONB;

COMMENT ON COLUMN pos_stores.public_logo_url IS
  'Logo on the guest menu''s header: a /pos-uploads/<file> path. NULL = none.';
COMMENT ON COLUMN pos_stores.public_address IS
  'Address line on the guest menu. Free text; the map link is built from it.';
COMMENT ON COLUMN pos_stores.public_phone IS
  'Phone on the guest menu, as typed; the tel: link is built from its digits.';
COMMENT ON COLUMN pos_stores.public_hours IS
  'Opening hours by ISO weekday ("1" = Monday): {"open":"HH:MM","close":"HH:MM"}; a missing day is closed, close <= open runs past midnight. NULL = not said.';

-- The two demo cafés show a filled-in header on their public menus. Applied
-- ONCE per store: only while none of the four fields has ever been written, so
-- whatever an owner (or a visitor with the demo's public credentials) typed
-- afterwards is never overwritten. The logos are static files in public/, which
-- `safeImageUrl` lets through as site-relative paths.
UPDATE pos_stores
SET public_logo_url = '/demo-cafe/logo.svg',
    public_address = 'м. Київ, вул. Прикладна, 1',
    public_phone = '+380 44 000 00 00',
    public_hours = '{"1":{"open":"08:00","close":"22:00"},"2":{"open":"08:00","close":"22:00"},"3":{"open":"08:00","close":"22:00"},"4":{"open":"08:00","close":"22:00"},"5":{"open":"08:00","close":"22:00"},"6":{"open":"09:00","close":"23:00"},"7":{"open":"09:00","close":"23:00"}}'::jsonb
WHERE slug = 'demo-cafe'
  AND public_logo_url IS NULL AND public_address IS NULL
  AND public_phone IS NULL AND public_hours IS NULL;

UPDATE pos_stores
SET public_logo_url = '/demo-restaurant/logo.svg',
    public_address = 'м. Київ, вул. Прикладна, 2',
    public_phone = '+380 44 000 00 01',
    public_hours = '{"1":{"open":"12:00","close":"23:00"},"2":{"open":"12:00","close":"23:00"},"3":{"open":"12:00","close":"23:00"},"4":{"open":"12:00","close":"23:00"},"5":{"open":"12:00","close":"01:00"},"6":{"open":"12:00","close":"01:00"},"7":{"open":"12:00","close":"22:00"}}'::jsonb
WHERE slug = 'demo-restaurant'
  AND public_logo_url IS NULL AND public_address IS NULL
  AND public_phone IS NULL AND public_hours IS NULL;
