-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 086_pos_product_menu_labels.sql
-- Dish labels on the guest's QR menu (TechDocs/POS_QR_MENU_FEEDBACK.md,
-- phase F9).
--
--   pos_products.menu_labels — codes from the fixed set of six in
--     `src/pos/menu-labels.ts` («Гостре», «Вегетаріанське», «Веганське»,
--     «Новинка», «Хіт», «Рекомендуємо»), ticked by the owner on the product
--     card and drawn as chips under the dish's name on the guest's page and
--     in the dish's sheet. On the PRODUCT, not the variant, for 060's reason:
--     an S, an M and an L of one soup are equally spicy. The application
--     refuses any other code, so a CHECK here would only be a second copy of
--     the list to keep in step (the 060 argument). The empty set says
--     nothing, which for a label is simply the truth.
--
--     Deliberately no «без глютену», which ChoiceQR offers: it is a claim
--     that an allergen is ABSENT, and the one thing this till says about
--     allergens is what IS in a dish (decision Д17).
--
-- «Шабля» (`shablya`) gets its one label ONCE — «Бограч» is `spicy` on its
-- ChoiceQR page, the only labelled dish of 177 — on the boot that adds the
-- column, the 080/082/083 pattern: an owner who takes it off must not find
-- it back after the next deploy (Д22). The importer carries labels for a
-- menu imported from now on; «Шабля»'s was imported before this column.
--
-- The two demo cafés get a few labels the 060 way — only while a dish has
-- none — so the site's screenshot comes from a real demo; no stamp is
-- bumped, so the demos' sales stay.
--
-- Re-runnable: the runner applies every file on every boot.

DO $labels$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'pos_products'
       AND column_name = 'menu_labels'
  ) THEN
    ALTER TABLE pos_products ADD COLUMN menu_labels TEXT[] NOT NULL DEFAULT '{}';

    -- EXECUTE, so the statement is planned after the column exists.
    EXECUTE $u$
      UPDATE pos_products p
         SET menu_labels = '{spicy}'::text[],
             updated_at = NOW()
        FROM pos_stores s
       WHERE p.store_id = s.id
         AND s.slug = 'shablya'
         AND s.vertical = 'cafe'
         AND p.name = 'Бограч'
         AND p.is_active
    $u$;
  END IF;
END
$labels$;

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS menu_labels TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN pos_products.menu_labels IS
  'Dish label codes (src/pos/menu-labels.ts) the owner ticked for the guest QR menu: spicy, vegetarian, vegan, new, hit, recommended. Empty = none shown.';

-- The demo cafés, so a visitor and the site's screenshot see the chips.
-- Applied only while the dish carries no label at all (the 060 rule), found
-- by store slug and name; a dish that is not there is simply skipped.
UPDATE pos_products p
SET menu_labels = d.labels
FROM (VALUES
  ('demo-cafe', 'Раф', '{hit}'::text[]),
  ('demo-cafe', 'Сирник', '{recommended}'::text[]),
  ('demo-restaurant', 'Борщ український', '{hit}'::text[]),
  ('demo-restaurant', 'Стейк Рібай', '{recommended}'::text[]),
  ('demo-restaurant', 'Грецький салат', '{vegetarian}'::text[]),
  ('demo-restaurant', 'Крем-суп гарбузовий', '{vegetarian}'::text[]),
  ('demo-restaurant', 'Лимонад домашній', '{new}'::text[])
) AS d(slug, name, labels)
JOIN pos_stores s ON s.slug = d.slug
WHERE p.store_id = s.id
  AND p.name = d.name
  AND p.sellable
  AND p.menu_labels = '{}';
