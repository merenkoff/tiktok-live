-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 082_pos_store_public_socials.sql
-- The guest menu's header learns what the place's ChoiceQR page had and ours
-- did not: an email, the social networks and a link to the place's own Google
-- card (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F1; the first profile columns
-- are 059).
--
--   public_email       — shown as a mailto: link; checked on the way in.
--   public_instagram,  — HANDLES, never addresses: the page builds
--   public_facebook,     `https://www.instagram.com/<handle>` itself, so an
--   public_tiktok        owner-typed URL never reaches an <a>.
--   public_google_url  — the one URL we do take from the owner, because Google
--                        has no handle: https only, and only on Google's own
--                        hosts (`public-menu/profile.ts`). It is where «На карті»
--                        points, and later (F3) where a guest is sent to leave a
--                        public review.
--
-- «Шабля» (`shablya`), the restaurant that asked, is filled ONCE from its own
-- public ChoiceQR page — only on the boot that adds the columns, as 080 did
-- with the short address, so an owner who later clears a field does not find it
-- back after the next deploy. The two demo cafés get an email and an Instagram
-- handle the 059 way: while all five are empty.
--
-- Re-runnable: the runner applies every file on every boot.

DO $socials$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'pos_stores'
       AND column_name = 'public_email'
  ) THEN
    ALTER TABLE pos_stores
      ADD COLUMN public_email VARCHAR(120),
      ADD COLUMN public_instagram VARCHAR(40),
      ADD COLUMN public_facebook VARCHAR(80),
      ADD COLUMN public_tiktok VARCHAR(40),
      ADD COLUMN public_google_url VARCHAR(300);

    -- EXECUTE, so the statement is planned after the columns exist.
    EXECUTE $u$
      UPDATE pos_stores
         SET public_email = 'shablya.ads@gmail.com',
             public_instagram = 'shablya.cafe',
             public_google_url = 'https://share.google/49kQb5FHbjSlkT7q6',
             updated_at = NOW()
       WHERE slug = 'shablya'
         AND vertical = 'cafe'
    $u$;
  END IF;
END
$socials$;

-- The columns exist for every boot after the first; these are harmless then
-- and let a database built from 059 alone still get them.
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_email VARCHAR(120);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_instagram VARCHAR(40);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_facebook VARCHAR(80);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_tiktok VARCHAR(40);
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_google_url VARCHAR(300);

COMMENT ON COLUMN pos_stores.public_email IS
  'The guest menu''s contact email (mailto:). Owner-written through PATCH /store/profile.';
COMMENT ON COLUMN pos_stores.public_instagram IS
  'Instagram HANDLE (no @, no URL): the page builds the link itself.';
COMMENT ON COLUMN pos_stores.public_facebook IS
  'Facebook page name as in facebook.com/<name>: the page builds the link itself.';
COMMENT ON COLUMN pos_stores.public_tiktok IS
  'TikTok HANDLE (no @, no URL): the page builds the link itself.';
COMMENT ON COLUMN pos_stores.public_google_url IS
  'The place''s own Google card: https, Google hosts only (profile.ts). Where «На карті» points.';

-- The demo cafés: an email on our own domain and a handle nobody is likely to
-- hold, so the chips row is on the page a visitor (and the site's screenshots)
-- sees. While all five are empty — a demo owner who typed something keeps it.
UPDATE pos_stores
   SET public_email = 'demo-cafe@the-live.shop',
       public_instagram = 'demo_cafe_the_live_shop'
 WHERE slug = 'demo-cafe'
   AND public_email IS NULL AND public_instagram IS NULL AND public_facebook IS NULL
   AND public_tiktok IS NULL AND public_google_url IS NULL;

UPDATE pos_stores
   SET public_email = 'demo-restaurant@the-live.shop',
       public_instagram = 'demo_resto_the_live_shop'
 WHERE slug = 'demo-restaurant'
   AND public_email IS NULL AND public_instagram IS NULL AND public_facebook IS NULL
   AND public_tiktok IS NULL AND public_google_url IS NULL;
