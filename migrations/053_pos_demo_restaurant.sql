-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 053_pos_demo_restaurant.sql
-- «Demo Restaurant» — the second café-vertical demo, and the one that shows
-- table service. See TechDocs/POS_TABLES.md §12 and POS_VERTICALS.md §7o.
--
-- WHY A SEPARATE STORE, AND WHY THIS FILE REPLACES THE OLD ONE
--
-- The first version of this migration hung a floor plan on `demo-cafe`,
-- reasoning that the module's PRESENCE is the restaurant switch (§4.11) and so
-- one store could demonstrate both. That is true of the mechanism and wrong as
-- a demo: whoever opens `demo-cafe` to see a counter-service coffee shop finds
-- a dining room, and the two formats stop being distinguishable. So the café
-- goes back to being a café, and the restaurant is its own store with its own
-- menu — dishes with tech cards, a kitchen and a bar, and the questions a
-- waiter actually asks about a steak.
--
-- Hence the FIRST block below, outside the stamp check and unconditional: it
-- strips halls, tables and bills from `demo-cafe` on every boot. That is
-- deliberate, not a leftover — `demo-cafe` is the counter-service demo by
-- definition, and a hall created there by hand would make it something else.
--
-- IDEMPOTENCY is 039's version stamp (`pos_demo_seed`), under the slug
-- `demo-restaurant`. No store → build and stamp. Stamp = `v_version` → return.
-- Older or absent stamp → the catalogue is REBUILT, which deletes this demo's
-- own sales, bills, refunds and stock documents but keeps the store row and
-- everything configured on it (`module_remotes` above all, which this file
-- never writes), its staff with their credentials, and its receipt counters.
-- Editing the menu below means bumping `v_version`.
--
-- The old `demo-cafe-hall` stamp is dropped at the end: the row it guarded no
-- longer describes anything, and leaving it would make a future reader think
-- the café still owns a room.
--
-- WHAT THE MENU DEMONSTRATES, beyond being a menu:
--
--   * Stations on tags (migration 050): «Гаряче» and «Супи» print in the
--     kitchen, «Бар» and «Вино» at the bar. A dish carrying both tags prints
--     in both — the sole reason «Брускета» is tagged «Закуски» only.
--   * A recipe inside a recipe: «Борщ» holds a portion of beef stock that is
--     itself a `derived` recipe, and «Стейк Рібай» holds a portion of
--     demi-glace that is an `own` recipe made in advance by a posted
--     production document. Both composition modes, as in the café.
--   * The three shapes of modifier, which is the point of a steak house:
--     «Просмаження» writes nothing off and costs nothing (it is an
--     instruction to the kitchen); «Гарнір» writes off a real side and some
--     answers cost extra; «Соус» adds both a price and a component. The
--     opposite of a bouquet — the line is the card's price plus the deltas,
--     never the sum of the ingredients.
--   * A dish deliberately at 0 stock («Лосось»), so the till shows a grey
--     tile with «немає» rather than hiding it — the waiter has to be able to
--     tell a guest that the salmon is gone.
--
-- The rooms are EMPTY: no bills, no rounds. A seeded bill ages badly — its
-- `opened_at` is fixed in this file, and «сидять 3 дні» would be the first
-- thing anybody saw. The waiter opens the first one.
--
-- Coordinates are grid CELLS (§4.8), not pixels: `pos_x`/`pos_y` is the
-- top-left corner and `width`/`height` the size, so the same room reads the
-- same on a laptop, on a waiter's tablet and on the till.
--
-- Pictures are flat SVGs under `public/demo-restaurant/` (regenerate with
-- `node scripts/gen-demo-restaurant.mjs public/demo-restaurant`).
--
-- Variant captions are written out by hand because SQL cannot call the
-- vertical's `labelOf`. `src/__tests__/pos.demo-restaurant.test.ts` re-derives
-- every one through the real café rule and fails the moment this file and
-- `src/pos/verticals/cafe.ts` disagree.
--
-- This file writes NO `module_remotes`: which bundle URL a store loads is a
-- deployment choice (the super admin sets it), and baking one in would send
-- production tills looking for a module that is not there. A restaurant needs
-- two entries — `vertical-cafe` for the menu and kitchen board, `tables` for
-- the room and the bills.
--
-- To remove the store entirely, delete in this order (Postgres checks
-- ON DELETE RESTRICT mid-cascade): pos_bill_item_components, pos_bill_items,
-- pos_bill_rounds, pos_bills, pos_tables, pos_halls, then 048's list, then
-- pos_stores.

-- ── The café goes back to being a café ──────────────────────────────────────
-- Unconditional and idempotent: nothing to delete once it has run. Bills point
-- at tables with ON DELETE RESTRICT, so they go first.
DO $$
DECLARE
  v_cafe bigint;
BEGIN
  SELECT id INTO v_cafe FROM pos_stores WHERE slug = 'demo-cafe';
  IF v_cafe IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pos_halls WHERE store_id = v_cafe) THEN
    RAISE NOTICE 'demo-cafe: removing the floor plan — it is the counter-service demo';
    DELETE FROM pos_bill_item_components WHERE store_id = v_cafe;
    DELETE FROM pos_bill_items WHERE store_id = v_cafe;
    DELETE FROM pos_bill_rounds WHERE store_id = v_cafe;
    DELETE FROM pos_bills WHERE store_id = v_cafe;
    DELETE FROM pos_tables WHERE store_id = v_cafe;
    DELETE FROM pos_halls WHERE store_id = v_cafe;
  END IF;
END $$;

-- ── The restaurant ──────────────────────────────────────────────────────────
DO $$
DECLARE
  -- Bump when the catalogue below changes. The header says what that does.
  v_version CONSTANT int := 2;
  v_stamped    int;
  v_store      bigint;
  v_owner      bigint;
  v_year       int := EXTRACT(YEAR FROM NOW())::int;
  v_doc        bigint;
  v_prod       bigint;
  v_variant    bigint;
  v_part       bigint;
  v_group      bigint;
  v_hall       bigint;
  v_terrace    bigint;
  r            record;
  c            record;
  v_unit_cost  int;
  v_seq        int := 0;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-restaurant';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-restaurant';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE 'demo-restaurant already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE 'demo-restaurant at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only; the store row and its configuration stay (see the header).
    -- 048's order, with the bill tables ahead of it: a bill line holds a
    -- variant, and its component snapshot holds another.
    DELETE FROM pos_bill_item_components WHERE store_id = v_store;
    DELETE FROM pos_bill_items WHERE store_id = v_store;
    DELETE FROM pos_bill_rounds WHERE store_id = v_store;
    DELETE FROM pos_bills WHERE store_id = v_store;
    DELETE FROM pos_fiscal_receipts WHERE store_id = v_store;
    DELETE FROM pos_refund_items
     WHERE refund_id IN (SELECT id FROM pos_refunds WHERE store_id = v_store);
    DELETE FROM pos_refunds WHERE store_id = v_store;
    DELETE FROM pos_payments WHERE store_id = v_store;
    DELETE FROM pos_sale_item_modifiers WHERE store_id = v_store;
    DELETE FROM pos_sale_item_components WHERE store_id = v_store;
    DELETE FROM pos_sale_items WHERE store_id = v_store;
    DELETE FROM pos_sales WHERE store_id = v_store;
    DELETE FROM pos_idempotency_keys WHERE store_id = v_store;
    DELETE FROM pos_stock_reservations WHERE store_id = v_store;
    DELETE FROM pos_parked_cart_items WHERE store_id = v_store;
    DELETE FROM pos_parked_carts WHERE store_id = v_store;
    DELETE FROM pos_preorder_items WHERE store_id = v_store;
    DELETE FROM pos_preorders WHERE store_id = v_store;
    DELETE FROM pos_stock_document_lines WHERE store_id = v_store;
    DELETE FROM pos_stock_documents WHERE store_id = v_store;
    DELETE FROM pos_product_modifier_groups WHERE store_id = v_store;
    DELETE FROM pos_modifiers WHERE store_id = v_store;
    DELETE FROM pos_modifier_groups WHERE store_id = v_store;
    DELETE FROM pos_product_components WHERE store_id = v_store;
    DELETE FROM pos_variant_barcode_fixes WHERE store_id = v_store;
    DELETE FROM pos_stock_movements WHERE store_id = v_store;
    DELETE FROM pos_stock WHERE store_id = v_store;
    DELETE FROM pos_product_tags
     WHERE product_id IN (SELECT id FROM pos_products WHERE store_id = v_store);
    DELETE FROM pos_variants WHERE store_id = v_store;
    DELETE FROM pos_products WHERE store_id = v_store;
    DELETE FROM pos_tags WHERE store_id = v_store;
    -- The room is rebuilt too: its tables are named in this file.
    DELETE FROM pos_tables WHERE store_id = v_store;
    DELETE FROM pos_halls WHERE store_id = v_store;

    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES ('Demo Restaurant', 'demo-restaurant', 'UAH', 'Europe/Kyiv', 'cafe')
    RETURNING id INTO v_store;
  END IF;

  -- The same bcrypt(10) digests 039 and 048 carry (owner123 / 1234), so the
  -- demo credentials are one thing to remember rather than three.
  -- `pos.demo-restaurant.test.ts` verifies them against the real
  -- `verifyPassword` / `verifyPin`. Only when the store has nobody — see 039.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власник', 'owner@restaurant.shop',
      '$2b$10$SAR9nrA9Y5gEsMs0MJuRbOwC7CySrhVz7uBQzLwgUulAkMLLfzNmG',
      '$2b$10$z0Fo3/EBQ0JxfO9NCJG65uT6kLeMT2gceRpiSlAokkSv0Bru9R5Bq'
    )
    RETURNING id INTO v_owner;
  END IF;

  -- Two waiters, because «усі бачать усе» (§4.7) is only visible with two.
  IF NOT EXISTS (
    SELECT 1 FROM pos_staff WHERE store_id = v_store AND role = 'seller' AND is_active
  ) THEN
    INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
    VALUES
      (v_store, 'seller', 'Офіціантка Олена',
       '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'),
      (v_store, 'seller', 'Офіціант Тарас',
       '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q');
  END IF;

  -- ── Tags, with the station that routes the kitchen ticket ───────────────
  -- `station` is what К3b added (migration 050): the printer a dish goes to.
  -- Food is 'kitchen', drinks are 'bar', ingredients have none and stay out of
  -- the catalog bar.
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar, station)
  VALUES
    (v_store, 'Закуски',     10, 'amber', TRUE,  'kitchen'),
    (v_store, 'Салати',      20, 'green', TRUE,  'kitchen'),
    (v_store, 'Супи',        30, 'rose',  TRUE,  'kitchen'),
    (v_store, 'Гаряче',      40, 'slate', TRUE,  'kitchen'),
    (v_store, 'Десерти',     50, 'rose',  TRUE,  'kitchen'),
    (v_store, 'Бар',         60, 'amber', TRUE,  'bar'),
    (v_store, 'Вино',        70, 'rose',  TRUE,  'bar'),
    (v_store, 'Інгредієнти', 80, 'slate', FALSE, NULL);

  -- ── Ingredients ─────────────────────────────────────────────────────────
  -- `sellable = FALSE`: on the shelf, in the recipes and in the stock count,
  -- never on the sell screen (044). Whole units in the base unit — 150 ml of
  -- wine is quantity 150 in unit 'мл', and the cost is per that unit. Wine is
  -- stocked in millilitres precisely so a glass can be a recipe over a bottle.
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,        image,        unit,  cost,    qty
      ('Яловичина',           'beef',       'г',      45,  40000),
      ('Рібай',               'ribeye',     'г',     120,  12000),
      ('Куряче філе',         'chicken',    'г',      22,  30000),
      ('Лосось',              'salmon',     'г',      95,   8000),
      ('Бекон',               'bacon',      'г',      55,   5000),
      ('Буряк',               'beet',       'г',       4,  20000),
      ('Капуста',             'cabbage',    'г',       3,  20000),
      ('Картопля',            'potato',     'г',       3,  60000),
      ('Морква',              'carrot',     'г',       4,  15000),
      ('Цибуля',              'onion',      'г',       3,  15000),
      ('Часник',              'garlic',     'г',      20,   2000),
      ('Помідор',             'tomato',     'г',      10,  15000),
      ('Огірок',              'cucumber',   'г',       8,  10000),
      ('Салат-мікс',          'lettuce',    'г',      30,   5000),
      ('Гарбуз',              'pumpkin',    'г',       6,  12000),
      ('Пармезан',            'parmesan',   'г',      90,   3000),
      ('Сир фета',            'feta',       'г',      45,   4000),
      ('Сир маскарпоне',      'mascarpone', 'г',      60,   3000),
      ('Вершки',              'cream',      'мл',     12,  10000),
      ('Сметана',             'sour-cream', 'г',       9,   6000),
      ('Масло вершкове',      'butter',     'г',      25,   5000),
      ('Олія',                'oil',        'мл',      6,  10000),
      ('Борошно',             'flour',      'г',       3,  10000),
      ('Яйце',                'egg',        'шт',    900,    200),
      ('Спагеті',             'pasta',      'г',      10,  10000),
      ('Рис',                 'rice',       'г',       7,  10000),
      ('Хліб',                'bread',      'г',       6,   8000),
      ('Булочка бургерна',    'bun',        'шт',    900,    100),
      ('Печиво савоярді',     'savoiardi',  'г',      50,   2000),
      ('Цукор',               'sugar',      'г',       4,  10000),
      ('Лимон',               'lemon',      'г',      12,   5000),
      ('Мʼята',               'mint',       'г',      80,    500),
      -- Filtered water is not free, and 0 does not mean «free» anywhere in
      -- this system — it means «we do not know», which is what keeps a dish
      -- with an unpriced ingredient out of the menu matrix (POS_VERTICALS.md
      -- §7q). At 0 this one row took every coffee and every soup out of it.
      -- A 19 l bottle at ~110 ₴ is 0.58 kopiyky per ml, so 1 is the honest
      -- rounding on an integer-kopiyka scale, not a placeholder.
      ('Вода',                'water',      'мл',      1, 200000),
      ('Содова',              'soda',       'мл',      2,  30000),
      ('Зерно арабіка',       'beans',      'г',      60,   5000),
      ('Молоко',              'milk',       'мл',      4,  20000),
      ('Вино червоне',        'wine-red',   'мл',     18,  15000),
      ('Вино біле',           'wine-white', 'мл',     16,  12000),
      ('Морозиво ванільне',   'ice-cream',  'г',      22,   4000)
    ) AS t(name, image, unit, cost, qty)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (v_store, r.name, '/demo-restaurant/' || r.image || '.svg', 'simple', 'own', FALSE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', r.unit, 0, r.cost)
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
  END LOOP;

  -- ── Semi-finished products ──────────────────────────────────────────────
  -- Portioned, so whole units work (POS_CAFE.md §9.3). The stock and the
  -- dressing are `derived` — folded into whatever names them; the demi-glace
  -- is `own`, simmered in advance and written off as itself by the production
  -- document below. Neither is on the menu.
  FOR r IN
    SELECT * FROM (VALUES
      ('Бульйон яловичий, порція', 'stock-pot', 'derived'),
      ('Заправка цезар, порція',   'dressing',  'derived'),
      ('Соус демі-глас, порція',   'demiglace', 'own')
    ) AS t(name, image, mode)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (v_store, r.name, '/demo-restaurant/' || r.image || '.svg', 'composite', r.mode, FALSE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', 0, 0)
    RETURNING id INTO v_variant;
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;

  -- ── Sides, as products a modifier can write off ─────────────────────────
  -- A side is a real `derived` dish: «Гарнір» answers point at these, so
  -- choosing «картопля фрі» takes potatoes and oil off the shelf, not a
  -- notional unit. They are not on the menu — a side is not ordered alone.
  FOR r IN
    SELECT * FROM (VALUES
      ('Гарнір: картопля фрі',  'fries'),
      ('Гарнір: пюре',          'mash'),
      ('Гарнір: рис',           'rice-side'),
      ('Гарнір: овочі гриль',   'veg-grill')
    ) AS t(name, image)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (v_store, r.name, '/demo-restaurant/' || r.image || '.svg', 'composite', 'derived', FALSE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', 0, 0)
    RETURNING id INTO v_variant;
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;

  -- ── The menu ────────────────────────────────────────────────────────────
  -- `derived` dishes are cooked to order: no shelf of their own, availability
  -- is whatever the ingredients allow, and a dish disappears when they run out
  -- (Square's auto-86 for free). The three `simple` ones are bought in and
  -- counted: tiramisu comes from the pastry shop, water and the wine glasses
  -- pour from a bottle the recipe names.
  --
  -- «Лосось» is deliberately at 0 with no recipe path to more: the till shows
  -- a grey tile with «немає», which is how a waiter learns to say it out loud.
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,            image,          tag,        kind,        price,  cost,  qty
      ('Брускета з томатами',     'bruschetta',   'Закуски',  'composite',  14500,     0,    0),
      ('Сирна тарілка',           'cheese-plate', 'Закуски',  'composite',  28500,     0,    0),
      ('Цезар з куркою',          'caesar',       'Салати',   'composite',  24500,     0,    0),
      ('Грецький салат',          'greek',        'Салати',   'composite',  19500,     0,    0),
      ('Борщ український',        'borscht',      'Супи',     'composite',  16500,     0,    0),
      ('Крем-суп гарбузовий',     'pumpkin-soup', 'Супи',     'composite',  15500,     0,    0),
      ('Стейк Рібай',             'steak',        'Гаряче',   'composite',  68500,     0,    0),
      ('Курка гриль',             'chicken-dish', 'Гаряче',   'composite',  28500,     0,    0),
      ('Лосось на грилі',         'salmon-dish',  'Гаряче',   'simple',     45500, 22000,    0),
      ('Паста карбонара',         'carbonara',    'Гаряче',   'composite',  26500,     0,    0),
      ('Бургер з яловичини',      'burger',       'Гаряче',   'composite',  29500,     0,    0),
      ('Тірамісу',                'tiramisu',     'Десерти',  'composite',  16500,     0,    0),
      ('Морозиво з ягодами',      'ice-bowl',     'Десерти',  'composite',   9500,     0,    0),
      ('Еспресо',                 'espresso',     'Бар',      'composite',   5500,     0,    0),
      ('Американо',               'americano',    'Бар',      'composite',   6500,     0,    0),
      ('Лате',                    'latte',        'Бар',      'composite',   7500,     0,    0),
      ('Лимонад домашній',        'lemonade',     'Бар',      'composite',  11500,     0,    0),
      ('Вода мінеральна 0,5 л',   'bottle',       'Бар',      'simple',      5500,  2000,   60),
      ('Вино червоне, келих',     'glass-red',    'Вино',     'composite',  16500,     0,    0),
      ('Вино біле, келих',        'glass-white',  'Вино',     'composite',  15500,     0,    0)
    ) AS t(name, image, tag, kind, price, cost, qty)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (
      v_store, r.name, '/demo-restaurant/' || r.image || '.svg',
      r.kind, CASE WHEN r.kind = 'composite' THEN 'derived' ELSE 'own' END, TRUE
    )
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', r.price, r.cost)
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    IF r.qty > 0 THEN
      INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
      VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
    END IF;
  END LOOP;

  -- ── Recipes ─────────────────────────────────────────────────────────────
  -- Per one portion, in the component's own unit. Looked up by name, so a name
  -- that drifts fails here rather than quietly building a borscht out of
  -- nothing. The two nested ones are marked.
  FOR c IN
    SELECT * FROM (VALUES
      -- dish,                       part,                          qty, ord
      ('Бульйон яловичий, порція',   'Яловичина',                     80,  0),
      ('Бульйон яловичий, порція',   'Морква',                        20,  1),
      ('Бульйон яловичий, порція',   'Цибуля',                        20,  2),
      ('Бульйон яловичий, порція',   'Вода',                         300,  3),
      ('Заправка цезар, порція',     'Яйце',                           1,  0),
      ('Заправка цезар, порція',     'Олія',                          30,  1),
      ('Заправка цезар, порція',     'Часник',                         5,  2),
      ('Соус демі-глас, порція',     'Яловичина',                     40,  0),
      ('Соус демі-глас, порція',     'Морква',                        15,  1),
      ('Соус демі-глас, порція',     'Цибуля',                        15,  2),
      ('Соус демі-глас, порція',     'Масло вершкове',                10,  3),

      ('Гарнір: картопля фрі',       'Картопля',                     200,  0),
      ('Гарнір: картопля фрі',       'Олія',                          30,  1),
      ('Гарнір: пюре',               'Картопля',                     200,  0),
      ('Гарнір: пюре',               'Молоко',                        50,  1),
      ('Гарнір: пюре',               'Масло вершкове',                20,  2),
      ('Гарнір: рис',                'Рис',                          120,  0),
      ('Гарнір: рис',                'Масло вершкове',                10,  1),
      ('Гарнір: овочі гриль',        'Помідор',                      100,  0),
      ('Гарнір: овочі гриль',        'Огірок',                        60,  1),
      ('Гарнір: овочі гриль',        'Олія',                          20,  2),

      ('Брускета з томатами',        'Хліб',                         120,  0),
      ('Брускета з томатами',        'Помідор',                      150,  1),
      ('Брускета з томатами',        'Часник',                         5,  2),
      ('Брускета з томатами',        'Олія',                          15,  3),

      ('Сирна тарілка',              'Пармезан',                      60,  0),
      ('Сирна тарілка',              'Сир фета',                      60,  1),
      ('Сирна тарілка',              'Хліб',                          80,  2),

      -- A recipe inside a recipe: the dressing is itself `derived`.
      ('Цезар з куркою',             'Куряче філе',                  120,  0),
      ('Цезар з куркою',             'Салат-мікс',                   100,  1),
      ('Цезар з куркою',             'Пармезан',                      20,  2),
      ('Цезар з куркою',             'Хліб',                          40,  3),
      ('Цезар з куркою',             'Заправка цезар, порція',         1,  4),

      ('Грецький салат',             'Помідор',                      120,  0),
      ('Грецький салат',             'Огірок',                       100,  1),
      ('Грецький салат',             'Сир фета',                      60,  2),
      ('Грецький салат',             'Цибуля',                        20,  3),
      ('Грецький салат',             'Олія',                          15,  4),

      -- And another: the borscht stands on a portion of beef stock.
      ('Борщ український',           'Бульйон яловичий, порція',       1,  0),
      ('Борщ український',           'Буряк',                        120,  1),
      ('Борщ український',           'Капуста',                       80,  2),
      ('Борщ український',           'Картопля',                     100,  3),
      ('Борщ український',           'Сметана',                       30,  4),

      ('Крем-суп гарбузовий',        'Гарбуз',                       250,  0),
      ('Крем-суп гарбузовий',        'Вершки',                        60,  1),
      ('Крем-суп гарбузовий',        'Цибуля',                        20,  2),
      ('Крем-суп гарбузовий',        'Масло вершкове',                15,  3),

      -- The steak's demi-glace is `own`: a leaf here, made in advance below.
      ('Стейк Рібай',                'Рібай',                        300,  0),
      ('Стейк Рібай',                'Масло вершкове',                20,  1),
      ('Стейк Рібай',                'Соус демі-глас, порція',         1,  2),

      ('Курка гриль',                'Куряче філе',                  250,  0),
      ('Курка гриль',                'Олія',                          20,  1),
      ('Курка гриль',                'Часник',                         5,  2),

      ('Паста карбонара',            'Спагеті',                      150,  0),
      ('Паста карбонара',            'Бекон',                         60,  1),
      ('Паста карбонара',            'Яйце',                           1,  2),
      ('Паста карбонара',            'Пармезан',                      30,  3),
      ('Паста карбонара',            'Вершки',                        50,  4),

      ('Бургер з яловичини',         'Булочка бургерна',               1,  0),
      ('Бургер з яловичини',         'Яловичина',                    180,  1),
      ('Бургер з яловичини',         'Помідор',                       40,  2),
      ('Бургер з яловичини',         'Салат-мікс',                    20,  3),
      ('Бургер з яловичини',         'Сир фета',                      30,  4),

      ('Тірамісу',                   'Сир маскарпоне',               120,  0),
      ('Тірамісу',                   'Печиво савоярді',               60,  1),
      ('Тірамісу',                   'Яйце',                           1,  2),
      ('Тірамісу',                   'Цукор',                         30,  3),
      ('Морозиво з ягодами',         'Морозиво ванільне',            150,  0),

      ('Еспресо',                    'Зерно арабіка',                 18,  0),
      ('Американо',                  'Зерно арабіка',                 18,  0),
      ('Американо',                  'Вода',                         180,  1),
      ('Лате',                       'Зерно арабіка',                 18,  0),
      ('Лате',                       'Молоко',                       200,  1),
      ('Лимонад домашній',           'Лимон',                         60,  0),
      ('Лимонад домашній',           'Цукор',                         30,  1),
      ('Лимонад домашній',           'Мʼята',                          5,  2),
      ('Лимонад домашній',           'Содова',                       300,  3),

      -- A glass is a recipe over the bottle: stock is millilitres of wine.
      ('Вино червоне, келих',        'Вино червоне',                 150,  0),
      ('Вино біле, келих',           'Вино біле',                    150,  0)
    ) AS t(dish, part, qty, ord)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     -- A «dish» here is either a menu item or one of the off-menu builders
     -- above (a portion or a side), and those are exactly the names ending
     -- in «, порція» or starting with «Гарнір:». No product name appears on
     -- both sides of that line, so this picks one row.
     WHERE v.store_id = v_store AND p.name = c.dish
       AND p.sellable = (c.dish NOT LIKE '%порція%' AND c.dish NOT LIKE 'Гарнір:%');
    IF v_variant IS NULL THEN
      RAISE EXCEPTION 'demo-restaurant: no dish %', c.dish;
    END IF;

    SELECT v.id INTO v_part
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.part AND NOT p.sellable;
    IF v_part IS NULL THEN
      RAISE EXCEPTION 'demo-restaurant: no component % for dish %', c.part, c.dish;
    END IF;

    INSERT INTO pos_product_components
      (store_id, variant_id, component_variant_id, quantity, sort_order)
    VALUES (v_store, v_variant, v_part, c.qty, c.ord);
  END LOOP;

  -- ── Modifier groups ─────────────────────────────────────────────────────
  -- A group is a question with a count of answers. `is_default` is a hint to
  -- the till (one tap for «як завжди»); the server never applies it, so a
  -- required group without a default is exactly what makes the sheet open.
  --
  -- «Просмаження» is required and has NO default on purpose: nobody should be
  -- able to fire a steak without the waiter having asked. That is the one
  -- question on this menu that forces the sheet open.
  FOR r IN
    SELECT * FROM (VALUES
      ('Просмаження', 1, 1, 10),
      ('Гарнір',      1, 1, 20),
      ('Соус',        0, 2, 30),
      ('Хліб',        0, 1, 40),
      ('Лід',         0, 1, 50)
    ) AS t(name, min_sel, max_sel, ord)
  LOOP
    INSERT INTO pos_modifier_groups (store_id, name, min_select, max_select, sort_order)
    VALUES (v_store, r.name, r.min_sel, r.max_sel, r.ord);
  END LOOP;

  -- The three shapes side by side:
  --   * «Просмаження» — no delta, no component. An instruction to the kitchen,
  --     which is exactly what a modifier without a write-off is for.
  --   * «Гарнір» — a component every time (a real `derived` side, so choosing
  --     mash takes potatoes, milk and butter), and a delta on the dearer ones.
  --   * «Соус» — both a delta and a component.
  -- «половина» carries a NEGATIVE delta: the line price may go down, and the
  -- server only refuses a result below zero.
  FOR c IN
    SELECT * FROM (VALUES
      -- group,         answer,              delta,  component,                  qty, default, ord
      ('Просмаження',   'з кровʼю',              0,  NULL,                      NULL, FALSE,   0),
      ('Просмаження',   'середнє',               0,  NULL,                      NULL, FALSE,   1),
      ('Просмаження',   'повне',                 0,  NULL,                      NULL, FALSE,   2),
      ('Гарнір',        'картопля фрі',          0,  'Гарнір: картопля фрі',       1, TRUE,    0),
      ('Гарнір',        'пюре',                  0,  'Гарнір: пюре',               1, FALSE,   1),
      ('Гарнір',        'рис',                   0,  'Гарнір: рис',                1, FALSE,   2),
      ('Гарнір',        'овочі гриль',        2500,  'Гарнір: овочі гриль',        1, FALSE,   3),
      ('Соус',          'демі-глас',          3500,  'Соус демі-глас, порція',     1, FALSE,   0),
      ('Соус',          'часниковий',         1500,  'Часник',                    10, FALSE,   1),
      ('Соус',          'вершковий',          2000,  'Вершки',                    40, FALSE,   2),
      ('Хліб',          'подати хліб',         900,  'Хліб',                      60, FALSE,   0),
      ('Лід',           'з льодом',              0,  NULL,                      NULL, TRUE,    0),
      ('Лід',           'без льоду',             0,  NULL,                      NULL, FALSE,   1)
    ) AS t(grp, answer, delta, part, qty, is_default, ord)
  LOOP
    SELECT id INTO v_group FROM pos_modifier_groups WHERE store_id = v_store AND name = c.grp;
    v_part := NULL;
    IF c.part IS NOT NULL THEN
      SELECT v.id INTO v_part
        FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = v_store AND p.name = c.part AND NOT p.sellable;
      IF v_part IS NULL THEN
        RAISE EXCEPTION 'demo-restaurant: no component % for answer %', c.part, c.answer;
      END IF;
    END IF;

    INSERT INTO pos_modifiers
      (store_id, group_id, name, price_delta_cents, component_variant_id, component_quantity,
       is_default, sort_order)
    VALUES (v_store, v_group, c.answer, c.delta, v_part, c.qty, c.is_default, c.ord);
  END LOOP;

  -- Which dish asks which questions, in this order. Only the mains ask about a
  -- side; the steak is the one dish whose tile cannot be a single tap.
  FOR c IN
    SELECT * FROM (VALUES
      ('Стейк Рібай',          'Просмаження', 0),
      ('Стейк Рібай',          'Гарнір',      1),
      ('Стейк Рібай',          'Соус',        2),
      ('Курка гриль',          'Гарнір',      0),
      ('Курка гриль',          'Соус',        1),
      ('Лосось на грилі',      'Гарнір',      0),
      ('Лосось на грилі',      'Соус',        1),
      ('Бургер з яловичини',   'Гарнір',      0),
      ('Бургер з яловичини',   'Соус',        1),
      ('Борщ український',     'Хліб',        0),
      ('Крем-суп гарбузовий',  'Хліб',        0),
      ('Лимонад домашній',     'Лід',         0),
      ('Американо',            'Лід',         0)
    ) AS t(product, grp, ord)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = c.product AND sellable;
    SELECT id INTO v_group FROM pos_modifier_groups WHERE store_id = v_store AND name = c.grp;
    INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order)
    VALUES (v_store, v_prod, v_group, c.ord);
  END LOOP;

  -- ── What was simmered in advance ────────────────────────────────────────
  -- One posted production document, exactly what `produceComposite` writes:
  -- the components out, the assembled portions in at the cost they added up
  -- to. Only the demi-glace — the stock and the dressing are `derived` and are
  -- made as they sell.
  SELECT v.id INTO v_variant
    FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
   WHERE v.store_id = v_store AND p.name = 'Соус демі-глас, порція';

  SELECT COALESCE(SUM(pc.quantity * cv.cost_cents), 0)::int INTO v_unit_cost
    FROM pos_product_components pc
    JOIN pos_variants cv ON cv.id = pc.component_variant_id
   WHERE pc.variant_id = v_variant;

  v_seq := v_seq + 1;
  INSERT INTO pos_stock_documents
    (store_id, type, status, doc_number, occurred_at, note, created_by, posted_by, posted_at)
  VALUES (
    v_store, 'production', 'posted',
    'ВР-' || v_year || '-' || lpad(v_seq::text, 5, '0'),
    NOW(), 'Ранкова заготовка соусу', v_owner, v_owner, NOW()
  )
  RETURNING id INTO v_doc;

  INSERT INTO pos_stock_document_lines (document_id, store_id, variant_id, quantity, unit_cost_cents)
  VALUES (v_doc, v_store, v_variant, 30, v_unit_cost);

  FOR c IN
    SELECT pc.component_variant_id AS vid, pc.quantity AS per_unit
      FROM pos_product_components pc
     WHERE pc.variant_id = v_variant
     ORDER BY pc.sort_order, pc.id
  LOOP
    UPDATE pos_stock SET quantity = quantity - c.per_unit * 30, updated_at = NOW()
     WHERE variant_id = c.vid AND store_id = v_store;
    INSERT INTO pos_stock_movements
      (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id)
    VALUES (
      v_store, c.vid, -c.per_unit * 30, 'writeoff', 'stock_document', v_doc,
      'Ранкова заготовка соусу', v_owner
    );
  END LOOP;

  UPDATE pos_stock SET quantity = quantity + 30, updated_at = NOW()
   WHERE variant_id = v_variant AND store_id = v_store;
  INSERT INTO pos_stock_movements
    (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id, unit_cost_cents)
  VALUES (
    v_store, v_variant, 30, 'receipt', 'stock_document', v_doc,
    'Ранкова заготовка соусу', v_owner, v_unit_cost
  );
  UPDATE pos_variants SET cost_cents = v_unit_cost, updated_at = NOW() WHERE id = v_variant;

  INSERT INTO pos_store_counters (store_id, counter_key, next_value)
  VALUES (v_store, 'production_' || v_year, v_seq + 1)
  ON CONFLICT (store_id, counter_key) DO UPDATE SET next_value = EXCLUDED.next_value;

  -- ── The rooms ───────────────────────────────────────────────────────────
  -- Two halls, ten tables, read from the door. Empty: the waiter opens the
  -- first bill (see the header).
  INSERT INTO pos_halls (store_id, name, sort_order, is_active)
  VALUES (v_store, 'Зала', 0, TRUE)
  RETURNING id INTO v_hall;

  INSERT INTO pos_halls (store_id, name, sort_order, is_active)
  VALUES (v_store, 'Тераса', 1, TRUE)
  RETURNING id INTO v_terrace;

  -- Two twos by the window, a four in the corner, two rounds in the middle, a
  -- long six along the wall; the terrace is four fours in a row.
  INSERT INTO pos_tables (store_id, hall_id, name, seats, pos_x, pos_y, width, height, shape)
  VALUES
    (v_store, v_hall,    '1',  2, 0, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '2',  2, 2, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '3',  4, 5, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '4',  2, 0, 3, 2, 2, 'round'),
    (v_store, v_hall,    '5',  4, 2, 3, 2, 2, 'round'),
    (v_store, v_hall,    '6',  6, 5, 3, 3, 2, 'rect'),
    (v_store, v_terrace, 'T1', 4, 0, 0, 2, 2, 'rect'),
    (v_store, v_terrace, 'T2', 4, 2, 0, 2, 2, 'rect'),
    (v_store, v_terrace, 'T3', 4, 4, 0, 2, 2, 'rect'),
    (v_store, v_terrace, 'T4', 4, 6, 0, 2, 2, 'round');

  -- ── The expanded recipes ────────────────────────────────────────────────
  -- 045 already ran this boot, before this store existed. Same SQL as
  -- `recomputeFlat`, for this store only: a `derived` component is folded in,
  -- an `own` one stays a leaf, duplicates add up. Without it every derived
  -- dish would read as unavailable until the next restart.
  DELETE FROM pos_product_components_flat WHERE store_id = v_store;
  INSERT INTO pos_product_components_flat (store_id, variant_id, leaf_variant_id, quantity_per_unit)
  WITH RECURSIVE walk AS (
    SELECT pc.store_id, pc.variant_id AS root_id, pc.component_variant_id AS node_id,
           pc.quantity::bigint AS qty, 1 AS depth
    FROM pos_product_components pc
    WHERE pc.store_id = v_store
    UNION ALL
    SELECT w.store_id, w.root_id, pc.component_variant_id, w.qty * pc.quantity, w.depth + 1
    FROM walk w
    JOIN pos_variants nv ON nv.id = w.node_id
    JOIN pos_products np ON np.id = nv.product_id
    JOIN pos_product_components pc ON pc.variant_id = w.node_id AND pc.store_id = w.store_id
    WHERE np.kind = 'composite' AND np.stock_mode = 'derived' AND w.depth < 8
  )
  SELECT w.store_id, w.root_id, w.node_id, SUM(w.qty)::int
  FROM walk w
  JOIN pos_variants lv ON lv.id = w.node_id
  JOIN pos_products lp ON lp.id = lv.product_id
  WHERE NOT (lp.kind = 'composite' AND lp.stock_mode = 'derived')
  GROUP BY w.store_id, w.root_id, w.node_id;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-restaurant', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  -- The café's room is gone and so is the stamp that described it. Kept to the
  -- end so a failure above leaves the old row to be re-read next boot.
  DELETE FROM pos_demo_seed WHERE slug = 'demo-cafe-hall';

  RAISE NOTICE 'demo-restaurant ready at version % (id %)', v_version, v_store;
END $$;
