-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 083_pos_corkage_menu_hidden.sql
-- The cork fee on the guest menu, and a product the guest menu does not list
-- (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F2).
--
--   pos_stores.public_corkage — the place's own-alcohol terms as the page
--     prints them under its name, from ANY QR (the venue's or a table's):
--     `{ "fee_cents": 10000, "min_food_cents": 70000 | null, "note": "…" | null }`,
--     NULL = not shown. Structured on purpose: the two figures are what the
--     guest must see in one line, and the page formats them itself; the note
--     is the owner's own words under them. Checked on the way in and read
--     back through the same check (`public-menu/profile.ts`).
--
--   pos_products.menu_hidden — sold at the till, listed nowhere a guest reads.
--     The cork fee itself is such a product: the waiter rings «Корковий збір»
--     onto the bill, and without this flag a sellable product lands in the
--     guest menu's «Інше». Also a bag, a deposit, a service charge. Read by
--     `buildPublicMenu` only — the till, the shelf and the documents keep
--     seeing it, exactly as 044's `sellable` does the other way round.
--
-- «Шабля» (`shablya`), the restaurant that asked, gets its terms ONCE — on
-- the boot that adds the column, the 080/082 pattern — from its own public
-- ChoiceQR page, reworded for the two figures + note form. An owner who later
-- switches it off must not find it back after the next deploy.
--
-- Re-runnable: the runner applies every file on every boot.

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS menu_hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_products.menu_hidden IS
  'Sold at the till but never listed in the guest QR menu (a cork fee, a bag, a deposit). Read by buildPublicMenu only.';

DO $corkage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'pos_stores'
       AND column_name = 'public_corkage'
  ) THEN
    ALTER TABLE pos_stores ADD COLUMN public_corkage JSONB;

    -- EXECUTE, so the statement is planned after the column exists.
    EXECUTE $u$
      UPDATE pos_stores
         SET public_corkage = '{"fee_cents":10000,"min_food_cents":70000,"note":"До збору входять склянки, чарки, келихи та робота офіціанта.\nЯкщо алкоголь опиняється на столі без узгодження з офіціантом або барменом, корковий збір рахується автоматично.\nМи поважаємо кожного гостя і просимо поважати працю нашої молодої команди ❤️"}'::jsonb,
             updated_at = NOW()
       WHERE slug = 'shablya'
         AND vertical = 'cafe'
    $u$;
  END IF;
END
$corkage$;

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_corkage JSONB;

COMMENT ON COLUMN pos_stores.public_corkage IS
  'Own-alcohol terms on the guest menu: {fee_cents, min_food_cents|null, note|null}; NULL = not shown. Owner-written through PATCH /store/profile.';
