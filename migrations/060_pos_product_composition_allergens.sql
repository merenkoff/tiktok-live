-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 060_pos_product_composition_allergens.sql
-- What a dish says about what is in it, for the guest's QR menu
-- (TechDocs/POS_QR_MENU.md, phase Q3b). Two columns on the PRODUCT, not the
-- variant: an S, an M and an L of one latte have the same milk in them, and the
-- attribute bag that carries a size is per variant and replaced wholesale.
--
--   composition — one line the owner writes («Еспресо, молоко»), at most 400
--     characters (checked by the application). It is NOT the recipe: a recipe
--     lists stock (a cup, a lid, a syrup «порція») and leaves out what a
--     modifier adds, and the recipe never leaves the server.
--
--   allergens — codes from the fixed list of fourteen in `src/pos/allergens.ts`
--     (Regulation (EU) 1169/2011, Annex II); the application refuses any other
--     code, so a CHECK here would only be a second copy of the list to keep in
--     step. The empty set means «the owner has not said», never «there are
--     none»: the guest's page prints allergens only when some are ticked.
--
-- Both default to «nothing», so a store that never opens the new fields is
-- untouched. The runner applies this file on every boot, hence IF NOT EXISTS.

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS composition TEXT;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN pos_products.composition IS
  'One line of composition for the guest menu, written by the owner (not derived from the recipe). NULL = not said.';
COMMENT ON COLUMN pos_products.allergens IS
  'Allergen codes (src/pos/allergens.ts) the owner ticked. Empty = not said, NOT «none».';

-- The two demo cafés get dishes with a description, a composition and allergens,
-- so their public menus show what the feature does. Applied ONCE per dish: only
-- while the dish has neither a composition nor an allergen, so whatever an
-- owner (or a visitor with the demo's public credentials) wrote afterwards is
-- never overwritten, and an existing description is kept (COALESCE). Dishes are
-- found by store slug and name; one that is not there (a renamed or rebuilt
-- demo) is simply skipped.
UPDATE pos_products p
SET composition = d.composition,
    allergens = d.allergens,
    description = COALESCE(p.description, d.description)
FROM (VALUES
  ('demo-cafe', 'Еспресо', 'Класичний короткий еспресо', 'Кава арабіка, вода', '{}'::text[]),
  ('demo-cafe', 'Американо', NULL, 'Кава арабіка, вода', '{}'::text[]),
  ('demo-cafe', 'Латте', 'Еспресо з великою кількістю ніжного молока', 'Еспресо, молоко', '{milk}'::text[]),
  ('demo-cafe', 'Капучино', NULL, 'Еспресо, молоко', '{milk}'::text[]),
  ('demo-cafe', 'Флет вайт', NULL, 'Подвійне еспресо, молоко', '{milk}'::text[]),
  ('demo-cafe', 'Раф', 'Кава з вершками й ванільним цукром', 'Еспресо, вершки, ванільний цукор', '{milk}'::text[]),
  ('demo-cafe', 'Какао', NULL, 'Какао, молоко, цукор', '{milk}'::text[]),
  ('demo-cafe', 'Круасан', 'Масляний, з хрусткою скоринкою', 'Борошно пшеничне, масло вершкове, яйця, цукор, дріжджі', '{gluten,eggs,milk}'::text[]),
  ('demo-cafe', 'Чізкейк', NULL, 'Сир вершковий, печиво, масло, яйця, цукор', '{gluten,eggs,milk}'::text[]),
  ('demo-cafe', 'Сирник', 'Зі сметаною', 'Сир кисломолочний, яйця, борошно, цукор, ванілін', '{gluten,eggs,milk}'::text[]),
  ('demo-cafe', 'Сендвіч сніданковий', NULL, 'Тост, яйце, бекон, сир, соус', '{gluten,eggs,milk}'::text[]),
  ('demo-restaurant', 'Брускета з томатами', NULL, 'Чіабата, томати, базилік, оливкова олія, часник', '{gluten}'::text[]),
  ('demo-restaurant', 'Сирна тарілка', 'Добірка сирів із медом', 'Асорті сирів, мед, горіхи, виноград', '{milk,nuts}'::text[]),
  ('demo-restaurant', 'Цезар з куркою', 'Хрусткий ромен, курка гриль і пармезан', 'Курка, ромен, пармезан, грінки, соус цезар', '{gluten,eggs,milk,fish}'::text[]),
  ('demo-restaurant', 'Грецький салат', NULL, 'Томати, огірки, перець, оливки, сир фета, оливкова олія', '{milk}'::text[]),
  ('demo-restaurant', 'Борщ український', 'Зі сметаною і пампушками на вибір', 'Буряк, капуста, картопля, яловичина, сметана', '{milk}'::text[]),
  ('demo-restaurant', 'Крем-суп гарбузовий', NULL, 'Гарбуз, вершки, цибуля, оливкова олія', '{milk}'::text[]),
  ('demo-restaurant', 'Стейк Рібай', 'Витримана яловичина на грилі', 'Яловичина, сіль, перець', '{}'::text[]),
  ('demo-restaurant', 'Курка гриль', NULL, 'Курка, спеції, часник, оливкова олія', '{}'::text[]),
  ('demo-restaurant', 'Лосось на грилі', NULL, 'Лосось, лимон, оливкова олія', '{fish}'::text[]),
  ('demo-restaurant', 'Паста карбонара', NULL, 'Паста, бекон, яйця, пармезан, вершки', '{gluten,eggs,milk}'::text[]),
  ('demo-restaurant', 'Бургер з яловичини', NULL, 'Булочка, котлета з яловичини, сир, овочі, соус', '{gluten,eggs,milk,mustard,sesame}'::text[]),
  ('demo-restaurant', 'Тірамісу', NULL, 'Печиво савоярді, маскарпоне, яйця, кава, какао', '{gluten,eggs,milk}'::text[]),
  ('demo-restaurant', 'Морозиво з ягодами', NULL, 'Молочне морозиво, ягоди', '{milk}'::text[]),
  ('demo-restaurant', 'Лате', NULL, 'Еспресо, молоко', '{milk}'::text[]),
  ('demo-restaurant', 'Лимонад домашній', NULL, 'Лимон, цукор, вода, м’ята', '{}'::text[]),
  ('demo-restaurant', 'Вино червоне, келих', NULL, 'Вино виноградне', '{sulphites}'::text[]),
  ('demo-restaurant', 'Вино біле, келих', NULL, 'Вино виноградне', '{sulphites}'::text[])
) AS d(slug, name, description, composition, allergens)
JOIN pos_stores s ON s.slug = d.slug
WHERE p.store_id = s.id
  AND p.name = d.name
  AND p.sellable
  AND p.composition IS NULL
  AND p.allergens = '{}';
