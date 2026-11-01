-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 087_pos_product_dish_numbers.sql
-- The three numbers a dish's card says on the guest's QR menu
-- (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F14; decisions Д32–Д35):
--
--   kcal            — the calories of the PORTION as served (Д33), 0..9999.
--                     NULL = not said; 0 is allowed, because «0 ккал» for a
--                     glass of water is a statement, not silence.
--   strength_tenths — alcohol by volume in TENTHS of a percent (45 = 4,5 %),
--                     0..1000 — an integer on the wire, like kopecks and
--                     grams. NULL = not said; 0 = «безалкогольне», a
--                     statement too.
--   prep_minutes    — the time a dish takes, in minutes, 1..600. There is no
--                     zero: a dish that takes no time says nothing.
--
-- On the PRODUCT, not the variant, for 060's reason: a dish's facts live on
-- its card, and ChoiceQR — where the first client's menu came from — keeps
-- one `kcal` per dish too. A dish in several sizes shows the one number on
-- every size (Д33). The range CHECKs are right here, unlike 060's and 086's
-- code lists: a numeric range has no second copy to keep in step.
--
-- The two demo cafés get a few numbers the 060 way — only while a dish has
-- none of the three — so the site's screenshot comes from a live demo and
-- whatever an owner typed afterwards is never overwritten; no stamp is
-- bumped, so the demos' sales stay. «Шабля» has nothing to fill: on its
-- ChoiceQR page all three are 0 on every one of the 177 dishes, which is
-- ChoiceQR's «not said».
--
-- Re-runnable: the runner applies every file on every boot.

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS kcal INTEGER;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS strength_tenths INTEGER;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS prep_minutes INTEGER;

ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_kcal_check;
ALTER TABLE pos_products ADD CONSTRAINT pos_products_kcal_check
  CHECK (kcal IS NULL OR (kcal >= 0 AND kcal <= 9999));
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_strength_tenths_check;
ALTER TABLE pos_products ADD CONSTRAINT pos_products_strength_tenths_check
  CHECK (strength_tenths IS NULL OR (strength_tenths >= 0 AND strength_tenths <= 1000));
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_prep_minutes_check;
ALTER TABLE pos_products ADD CONSTRAINT pos_products_prep_minutes_check
  CHECK (prep_minutes IS NULL OR (prep_minutes >= 1 AND prep_minutes <= 600));

COMMENT ON COLUMN pos_products.kcal IS
  'Calories of the portion as served, for the guest QR menu (F14). NULL = not said; 0 is a statement.';
COMMENT ON COLUMN pos_products.strength_tenths IS
  'Alcohol by volume in tenths of a percent (45 = 4,5 %), for the guest QR menu (F14). NULL = not said; 0 = non-alcoholic.';
COMMENT ON COLUMN pos_products.prep_minutes IS
  'Preparation time in minutes, shown to the guest as approximate («≈ 25 хв», F14). NULL = not said.';

-- The demo cafés, so a visitor and the site's screenshot see the facts line.
-- Applied only while the dish carries none of the three (the 060 rule), found
-- by store slug and name; a dish that is not there is simply skipped.
UPDATE pos_products p
SET kcal = d.kcal,
    strength_tenths = d.strength_tenths,
    prep_minutes = d.prep_minutes
FROM (VALUES
  ('demo-cafe', 'Латте', 180, NULL::integer, 4),
  ('demo-cafe', 'Капучино', 120, NULL::integer, 4),
  ('demo-cafe', 'Какао', 220, NULL::integer, 4),
  ('demo-cafe', 'Круасан', 290, NULL::integer, NULL::integer),
  ('demo-cafe', 'Чізкейк', 420, NULL::integer, NULL::integer),
  ('demo-restaurant', 'Борщ український', 320, NULL::integer, 15),
  ('demo-restaurant', 'Цезар з куркою', 450, NULL::integer, 12),
  ('demo-restaurant', 'Стейк Рібай', 780, NULL::integer, 25),
  ('demo-restaurant', 'Паста карбонара', 640, NULL::integer, 18),
  ('demo-restaurant', 'Лимонад домашній', 120, NULL::integer, NULL::integer),
  ('demo-restaurant', 'Вино червоне, келих', 125, 130, NULL::integer),
  ('demo-restaurant', 'Вино біле, келих', 120, 120, NULL::integer)
) AS d(slug, name, kcal, strength_tenths, prep_minutes)
JOIN pos_stores s ON s.slug = d.slug
WHERE p.store_id = s.id
  AND p.name = d.name
  AND p.sellable
  AND p.kcal IS NULL
  AND p.strength_tenths IS NULL
  AND p.prep_minutes IS NULL;
