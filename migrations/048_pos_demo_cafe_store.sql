-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 048_pos_demo_cafe_store.sql
-- The «Demo Café» store — the café vertical's demo, as data rather than a seed
-- script, exactly like `039_pos_demo_flowers_store.sql` is for the florist.
-- See TechDocs/POS_CAFE.md §10 (К2) and POS_VERTICALS.md §7m.
--
-- ⚠ READ BEFORE DEPLOYING. Like 039, this inserts DEMO DATA into every
-- database the runner touches — production included — with PUBLICLY KNOWN
-- credentials (owner@cafe.shop / owner123, owner PIN 0000, seller PIN 1234).
-- Those accounts see only their own store. To drop it, delete the
-- transactional tables first, in this order, then the store:
--
--   BEGIN;
--   WITH s AS (SELECT id FROM pos_stores WHERE slug = 'demo-cafe')
--   DELETE FROM pos_fiscal_receipts WHERE store_id IN (SELECT id FROM s);
--   -- …then refunds, payments, sale item modifiers, sale item components,
--   -- sale items, sales, parked carts, pre-orders, stock documents,
--   -- product ↔ modifier links, modifiers, modifier groups — the rebuild
--   -- block below is the full ordered list…
--   DELETE FROM pos_stores WHERE slug = 'demo-cafe';
--   COMMIT;
--
-- Idempotency is the 039 stamp: `pos_demo_seed` records which build of this
-- demo a database carries and the DO block compares it with `v_version`.
-- No store → build and stamp; stamp = v_version → return (the no-op on every
-- boot); stamp older or absent → rebuild the catalogue and stamp. Editing the
-- VALUES lists below means bumping `v_version`. A rebuild REPLACES the
-- catalogue and DELETES the demo's own sales, refunds, parked carts,
-- pre-orders and stock documents; the store row with its configuration
-- (`module_remotes` above all — a migration never writes a module URL), its
-- staff, customers and receipt counters survive.
--
-- Two things this file does that 039 does not:
--
--   * It writes modifier groups (migration 046): the questions the till asks
--     about a drink («Молоко?», «Сироп?»), their answers with a signed price
--     delta and what an answer takes off the shelf. The drinks' recipes carry
--     NO milk — the milk is the answer's component (POS_CAFE.md §4.3), or it
--     would be written off twice.
--
--   * It rebuilds `pos_product_components_flat` for this store at the end.
--     Migration 045 rebuilds that table for every store on boot, but 045 runs
--     BEFORE this file, so a café built here would read every derived dish as
--     unavailable until the next restart. Same SQL as `recomputeFlat` in
--     `src/pos/composites.service.ts`, scoped to `v_store`.
--
-- The recipes nest: «Раф» holds a portion of caramel syrup that is itself a
-- `derived` recipe (sugar + water), and the breakfast sandwich holds a sauce
-- that is an `own` recipe made in advance by a posted production document —
-- the two composition modes side by side, as in the flowers demo.
--
-- Pictures are flat SVGs under `public/demo-cafe/` (regenerate with
-- `node scripts/gen-demo-cafe.mjs public/demo-cafe`).
--
-- Variant captions are written out by hand because SQL cannot call the
-- vertical's `labelOf` (for a café: the size, or nothing).
-- `src/__tests__/pos.demo-cafe.test.ts` re-derives every one through the real
-- café rule and fails the moment this file and `src/pos/verticals/cafe.ts`
-- disagree.

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
  r            record;
  c            record;
  v_unit_cost  int;
  v_seq        int := 0;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-cafe';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-cafe';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE 'demo-cafe already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE 'demo-cafe at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only; the store row and its configuration stay (see the header).
    -- The order follows the foreign keys. Beyond 039's list: the sale-line
    -- modifier snapshots go before the sale lines, parked carts and pre-orders
    -- hold their variant with a plain FK so they go before the variants, and
    -- the modifiers point at their component variants the same way.
    DELETE FROM pos_fiscal_receipts WHERE store_id = v_store;
    DELETE FROM pos_refund_items
     WHERE refund_id IN (SELECT id FROM pos_refunds WHERE store_id = v_store);
    DELETE FROM pos_refunds WHERE store_id = v_store;
    DELETE FROM pos_payments WHERE store_id = v_store;
    DELETE FROM pos_sale_item_modifiers WHERE store_id = v_store;
    DELETE FROM pos_sale_item_components WHERE store_id = v_store;
    DELETE FROM pos_sale_items WHERE store_id = v_store;
    DELETE FROM pos_sales WHERE store_id = v_store;
    -- Otherwise a replayed `client_uuid` answers with a sale that is gone.
    DELETE FROM pos_idempotency_keys WHERE store_id = v_store;
    -- Reservations would cascade from the carts; explicit, so the order is provable.
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

    -- Signed by the owner the store already has: a rebuild never rewrites
    -- anyone's credentials.
    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES ('Demo Café', 'demo-cafe', 'UAH', 'Europe/Kyiv', 'cafe')
    RETURNING id INTO v_store;
  END IF;

  -- The same bcrypt(10) digests 039 carries (owner123 / 0000 / 1234);
  -- `pos.demo-cafe.test.ts` verifies them against the real `verifyPassword` /
  -- `verifyPin`. Only when the store has nobody — see 039.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власник', 'owner@cafe.shop',
      '$2b$10$SAR9nrA9Y5gEsMs0MJuRbOwC7CySrhVz7uBQzLwgUulAkMLLfzNmG',
      '$2b$10$z0Fo3/EBQ0JxfO9NCJG65uT6kLeMT2gceRpiSlAokkSv0Bru9R5Bq'
    )
    RETURNING id INTO v_owner;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pos_staff WHERE store_id = v_store AND role = 'seller' AND is_active
  ) THEN
    INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
    VALUES (
      v_store, 'seller', 'Бариста Марта',
      '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'
    );
  END IF;

  -- ── Tags ────────────────────────────────────────────────────────────────
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar)
  VALUES
    (v_store, 'Кава',        10, 'amber', TRUE),
    (v_store, 'Чай',         20, 'green', TRUE),
    (v_store, 'Випічка',     30, 'rose',  TRUE),
    (v_store, 'Сніданки',    40, 'slate', TRUE),
    (v_store, 'Вода',        50, 'slate', TRUE),
    (v_store, 'Інгредієнти', 60, 'slate', FALSE);

  -- ── Ingredients ─────────────────────────────────────────────────────────
  -- `sellable = FALSE`: on the shelf, in the recipes and in the stock count,
  -- never on the sell screen (044). Counted whole in the base unit — 200 ml of
  -- milk is quantity 200 in unit 'мл'; the cost is per that unit. The paper
  -- cup is one product with three sizes, so a recipe can name «Стакан · M».
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,          image,          unit,  size,  cost,   qty
      ('Зерно арабіка',         'beans',        'г',   NULL,    60,   5000),
      ('Молоко звичайне',       'milk',         'мл',  NULL,     4,  20000),
      ('Молоко вівсяне',        'milk-oat',     'мл',  NULL,    12,  10000),
      ('Молоко мигдальне',      'milk-almond',  'мл',  NULL,    15,   5000),
      ('Цукор',                 'sugar',        'г',   NULL,     4,   5000),
      -- Filtered water is not free, and 0 does not mean «free» anywhere in
      -- this system — it means «we do not know», which is what keeps a dish
      -- with an unpriced ingredient out of the menu matrix (POS_VERTICALS.md
      -- §7q). At 0 this one row took every coffee and every soup out of it.
      -- A 19 l bottle at ~110 ₴ is 0.58 kopiyky per ml, so 1 is the honest
      -- rounding on an integer-kopiyka scale, not a placeholder.
      ('Вода',                  'water',        'мл',  NULL,     1, 100000),
      ('Какао',                 'cocoa',        'г',   NULL,    40,   2000),
      ('Чай чорний',            'tea-black',    'г',   NULL,    80,   1000),
      ('Чай зелений',           'tea-green',    'г',   NULL,    90,   1000),
      ('Стакан паперовий',      'cup-paper',    'шт',  'S',    300,    300),
      ('Стакан паперовий',      'cup-paper',    'шт',  'M',    350,    300),
      ('Стакан паперовий',      'cup-paper',    'шт',  'L',    400,    300),
      ('Кришка',                'lid',          'шт',  NULL,   100,    900),
      ('Хліб тостовий',         'bread',        'шт',  NULL,   300,    200),
      ('Сир',                   'cheese',       'г',   NULL,    30,   3000),
      ('Масло',                 'butter',       'г',   NULL,    25,   2000)
    ) AS t(name, image, unit, size, cost, qty)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.name;
    IF v_prod IS NULL THEN
      INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
      VALUES (v_store, r.name, '/demo-cafe/' || r.image || '.svg', 'simple', 'own', FALSE)
      RETURNING id INTO v_prod;
      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';
    END IF;

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (
      v_store, v_prod,
      CASE WHEN r.size IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('size', r.size) END,
      COALESCE(r.size, ''),
      r.unit, 0, r.cost
    )
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
  END LOOP;

  -- ── Semi-finished products ──────────────────────────────────────────────
  -- Portioned, so whole units work (POS_CAFE.md §9.3): one pump of syrup, one
  -- spoon of sauce. The syrup is `derived` — folded into every drink that
  -- names it; the sauce is `own` — made in advance below and written off as
  -- itself. Neither is on the menu.
  FOR r IN
    SELECT * FROM (VALUES
      ('Сироп карамельний, порція', 'syrup', 'derived'),
      ('Соус сніданковий, порція',  'sauce', 'own')
    ) AS t(name, image, mode)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (v_store, r.name, '/demo-cafe/' || r.image || '.svg', 'composite', r.mode, FALSE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', 0, 0)
    RETURNING id INTO v_variant;
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;

  -- ── Drinks ──────────────────────────────────────────────────────────────
  -- Every drink is a `derived` recipe: assembled when it sells, availability
  -- is what the beans and cups allow (Square's auto-86 for free). Sizes are
  -- variants of one card — S/M/L share the milk question. Espresso and flat
  -- white come in one size, which is what makes «як завжди» one tap in the
  -- e2e budget. The recipes carry no milk — the milk group does (§4.3).
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,   image,        tag,    size,  price
      ('Еспресо',        'espresso',   'Кава', NULL,   4500),
      ('Американо',      'americano',  'Кава', 'S',    5000),
      ('Американо',      'americano',  'Кава', 'M',    5500),
      ('Американо',      'americano',  'Кава', 'L',    6000),
      ('Латте',          'latte',      'Кава', 'S',    6000),
      ('Латте',          'latte',      'Кава', 'M',    6500),
      ('Латте',          'latte',      'Кава', 'L',    7000),
      ('Капучино',       'cappuccino', 'Кава', 'S',    6000),
      ('Капучино',       'cappuccino', 'Кава', 'M',    6500),
      ('Капучино',       'cappuccino', 'Кава', 'L',    7000),
      ('Флет вайт',      'flat-white', 'Кава', NULL,   7000),
      ('Раф',            'raf',        'Кава', 'S',    7500),
      ('Раф',            'raf',        'Кава', 'M',    8000),
      ('Раф',            'raf',        'Кава', 'L',    8500),
      ('Какао',          'cocoa-cup',  'Кава', 'S',    5500),
      ('Какао',          'cocoa-cup',  'Кава', 'M',    6000),
      ('Какао',          'cocoa-cup',  'Кава', 'L',    6500),
      ('Чай чорний',     'tea-cup',    'Чай',  'S',    3500),
      ('Чай чорний',     'tea-cup',    'Чай',  'M',    4000),
      ('Чай чорний',     'tea-cup',    'Чай',  'L',    4500),
      ('Чай зелений',    'tea-cup',    'Чай',  'S',    3500),
      ('Чай зелений',    'tea-cup',    'Чай',  'M',    4000),
      ('Чай зелений',    'tea-cup',    'Чай',  'L',    4500)
    ) AS t(name, image, tag, size, price)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.name AND sellable;
    IF v_prod IS NULL THEN
      INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
      VALUES (v_store, r.name, '/demo-cafe/' || r.image || '.svg', 'composite', 'derived', TRUE)
      RETURNING id INTO v_prod;
      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;
    END IF;

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (
      v_store, v_prod,
      CASE WHEN r.size IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('size', r.size) END,
      COALESCE(r.size, ''),
      'шт', r.price, 0
    )
    RETURNING id INTO v_variant;
    -- A derived composite's own stock row stays at 0; nothing reads it.
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;

  -- ── Food and water ──────────────────────────────────────────────────────
  -- Plain products with their own shelf. The syrnyk is deliberately at 0 —
  -- the tile on the till goes grey with «немає» rather than disappearing
  -- (POS_CAFE.md §3). The sandwich is an `own` recipe, assembled below.
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,               image,        tag,        kind,        price,  cost,  qty,  barcode
      ('Круасан',                    'croissant',  'Випічка',  'simple',     5500,  2500,   24,  NULL),
      ('Чізкейк',                    'cheesecake', 'Випічка',  'simple',     9500,  4500,   12,  NULL),
      ('Сирник',                     'syrnyk',     'Випічка',  'simple',     6500,  3000,    0,  NULL),
      ('Сендвіч сніданковий',        'sandwich',   'Сніданки', 'composite',  8500,     0,    0,  NULL),
      ('Вода негазована 0,5 л',      'bottle',     'Вода',     'simple',     3000,  1500,   48,  '4820120001017'),
      ('Вода газована 0,5 л',        'bottle',     'Вода',     'simple',     3000,  1500,   36,  '4820120001024')
    ) AS t(name, image, tag, kind, price, cost, qty, barcode)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode, sellable)
    VALUES (v_store, r.name, '/demo-cafe/' || r.image || '.svg', r.kind, 'own', TRUE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents, barcode)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', r.price, r.cost, r.barcode)
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    IF r.qty > 0 THEN
      INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
      VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
    END IF;
  END LOOP;

  -- ── Recipes ─────────────────────────────────────────────────────────────
  -- Per one unit of the dish, in the component's own unit. A dish with sizes
  -- has a recipe per size (the cup is the size). Looked up by the captions
  -- written above, so a caption that drifts from the café rule fails here
  -- rather than quietly building a latte out of nothing.
  FOR c IN
    SELECT * FROM (VALUES
      -- dish,                        size,  part product,                 part size, qty, ord
      ('Сироп карамельний, порція',   '',    'Цукор',                      '',          5,  0),
      ('Сироп карамельний, порція',   '',    'Вода',                       '',          5,  1),
      ('Соус сніданковий, порція',    '',    'Масло',                      '',         10,  0),
      ('Соус сніданковий, порція',    '',    'Сир',                        '',         15,  1),

      ('Еспресо',      '',   'Зерно арабіка',     '',   18, 0),
      ('Еспресо',      '',   'Стакан паперовий',  'S',   1, 1),
      ('Еспресо',      '',   'Кришка',            '',    1, 2),

      ('Американо',    'S',  'Зерно арабіка',     '',   18, 0),
      ('Американо',    'S',  'Вода',              '',  120, 1),
      ('Американо',    'S',  'Стакан паперовий',  'S',   1, 2),
      ('Американо',    'S',  'Кришка',            '',    1, 3),
      ('Американо',    'M',  'Зерно арабіка',     '',   18, 0),
      ('Американо',    'M',  'Вода',              '',  180, 1),
      ('Американо',    'M',  'Стакан паперовий',  'M',   1, 2),
      ('Американо',    'M',  'Кришка',            '',    1, 3),
      ('Американо',    'L',  'Зерно арабіка',     '',   18, 0),
      ('Американо',    'L',  'Вода',              '',  240, 1),
      ('Американо',    'L',  'Стакан паперовий',  'L',   1, 2),
      ('Американо',    'L',  'Кришка',            '',    1, 3),

      ('Латте',        'S',  'Зерно арабіка',     '',   18, 0),
      ('Латте',        'S',  'Стакан паперовий',  'S',   1, 1),
      ('Латте',        'S',  'Кришка',            '',    1, 2),
      ('Латте',        'M',  'Зерно арабіка',     '',   18, 0),
      ('Латте',        'M',  'Стакан паперовий',  'M',   1, 1),
      ('Латте',        'M',  'Кришка',            '',    1, 2),
      ('Латте',        'L',  'Зерно арабіка',     '',   18, 0),
      ('Латте',        'L',  'Стакан паперовий',  'L',   1, 1),
      ('Латте',        'L',  'Кришка',            '',    1, 2),

      ('Капучино',     'S',  'Зерно арабіка',     '',   18, 0),
      ('Капучино',     'S',  'Стакан паперовий',  'S',   1, 1),
      ('Капучино',     'S',  'Кришка',            '',    1, 2),
      ('Капучино',     'M',  'Зерно арабіка',     '',   18, 0),
      ('Капучино',     'M',  'Стакан паперовий',  'M',   1, 1),
      ('Капучино',     'M',  'Кришка',            '',    1, 2),
      ('Капучино',     'L',  'Зерно арабіка',     '',   18, 0),
      ('Капучино',     'L',  'Стакан паперовий',  'L',   1, 1),
      ('Капучино',     'L',  'Кришка',            '',    1, 2),

      ('Флет вайт',    '',   'Зерно арабіка',     '',   36, 0),
      ('Флет вайт',    '',   'Стакан паперовий',  'M',   1, 1),
      ('Флет вайт',    '',   'Кришка',            '',    1, 2),

      -- A recipe inside a recipe: the syrup portion is itself `derived`.
      ('Раф',          'S',  'Зерно арабіка',              '',   18, 0),
      ('Раф',          'S',  'Сироп карамельний, порція',  '',    1, 1),
      ('Раф',          'S',  'Стакан паперовий',           'S',   1, 2),
      ('Раф',          'S',  'Кришка',                     '',    1, 3),
      ('Раф',          'M',  'Зерно арабіка',              '',   18, 0),
      ('Раф',          'M',  'Сироп карамельний, порція',  '',    1, 1),
      ('Раф',          'M',  'Стакан паперовий',           'M',   1, 2),
      ('Раф',          'M',  'Кришка',                     '',    1, 3),
      ('Раф',          'L',  'Зерно арабіка',              '',   18, 0),
      ('Раф',          'L',  'Сироп карамельний, порція',  '',    2, 1),
      ('Раф',          'L',  'Стакан паперовий',           'L',   1, 2),
      ('Раф',          'L',  'Кришка',                     '',    1, 3),

      ('Какао',        'S',  'Какао',             '',   20, 0),
      ('Какао',        'S',  'Цукор',             '',   10, 1),
      ('Какао',        'S',  'Стакан паперовий',  'S',   1, 2),
      ('Какао',        'S',  'Кришка',            '',    1, 3),
      ('Какао',        'M',  'Какао',             '',   25, 0),
      ('Какао',        'M',  'Цукор',             '',   10, 1),
      ('Какао',        'M',  'Стакан паперовий',  'M',   1, 2),
      ('Какао',        'M',  'Кришка',            '',    1, 3),
      ('Какао',        'L',  'Какао',             '',   30, 0),
      ('Какао',        'L',  'Цукор',             '',   10, 1),
      ('Какао',        'L',  'Стакан паперовий',  'L',   1, 2),
      ('Какао',        'L',  'Кришка',            '',    1, 3),

      ('Чай чорний',   'S',  'Чай чорний',        '',    3, 0),
      ('Чай чорний',   'S',  'Вода',              '',  200, 1),
      ('Чай чорний',   'S',  'Стакан паперовий',  'S',   1, 2),
      ('Чай чорний',   'M',  'Чай чорний',        '',    3, 0),
      ('Чай чорний',   'M',  'Вода',              '',  300, 1),
      ('Чай чорний',   'M',  'Стакан паперовий',  'M',   1, 2),
      ('Чай чорний',   'L',  'Чай чорний',        '',    4, 0),
      ('Чай чорний',   'L',  'Вода',              '',  400, 1),
      ('Чай чорний',   'L',  'Стакан паперовий',  'L',   1, 2),
      ('Чай зелений',  'S',  'Чай зелений',       '',    3, 0),
      ('Чай зелений',  'S',  'Вода',              '',  200, 1),
      ('Чай зелений',  'S',  'Стакан паперовий',  'S',   1, 2),
      ('Чай зелений',  'M',  'Чай зелений',       '',    3, 0),
      ('Чай зелений',  'M',  'Вода',              '',  300, 1),
      ('Чай зелений',  'M',  'Стакан паперовий',  'M',   1, 2),
      ('Чай зелений',  'L',  'Чай зелений',       '',    4, 0),
      ('Чай зелений',  'L',  'Вода',              '',  400, 1),
      ('Чай зелений',  'L',  'Стакан паперовий',  'L',   1, 2),

      -- An `own` recipe inside an `own` recipe: the sauce is a leaf here.
      ('Сендвіч сніданковий', '',  'Хліб тостовий',              '',   2, 0),
      ('Сендвіч сніданковий', '',  'Сир',                        '',  30, 1),
      ('Сендвіч сніданковий', '',  'Соус сніданковий, порція',   '',   1, 2)
    ) AS t(dish, dish_label, part_product, part_label, qty, ord)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.dish AND v.label = c.dish_label;
    IF v_variant IS NULL THEN
      RAISE EXCEPTION 'demo-cafe: no dish % / "%"', c.dish, c.dish_label;
    END IF;

    SELECT v.id INTO v_part
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.part_product AND v.label = c.part_label;
    IF v_part IS NULL THEN
      RAISE EXCEPTION 'demo-cafe: no variant % / "%" for dish %',
        c.part_product, c.part_label, c.dish;
    END IF;

    INSERT INTO pos_product_components
      (store_id, variant_id, component_variant_id, quantity, sort_order)
    VALUES (v_store, v_variant, v_part, c.qty, c.ord);
  END LOOP;

  -- ── Modifier groups ─────────────────────────────────────────────────────
  -- A group is a question with a count of answers; an answer has a signed
  -- price delta and, optionally, what it takes off the shelf. `is_default` is
  -- a hint to the till (one tap for «як завжди»); the server never applies it.
  FOR r IN
    SELECT * FROM (VALUES
      ('Молоко',      1, 1, 10),
      ('Сироп',       0, 3, 20),
      ('Цукор',       1, 1, 30),
      ('Порція',      0, 1, 40),
      ('Температура', 0, 1, 50)
    ) AS t(name, min_sel, max_sel, ord)
  LOOP
    INSERT INTO pos_modifier_groups (store_id, name, min_select, max_select, sort_order)
    VALUES (v_store, r.name, r.min_sel, r.max_sel, r.ord);
  END LOOP;

  FOR c IN
    SELECT * FROM (VALUES
      -- group,        answer,          delta,  part product,                 part size, qty,  default, ord
      ('Молоко',       'звичайне',          0,  'Молоко звичайне',            '',        200,  TRUE,    0),
      ('Молоко',       'вівсяне',        1500,  'Молоко вівсяне',             '',        200,  FALSE,   1),
      ('Молоко',       'мигдальне',      1500,  'Молоко мигдальне',           '',        200,  FALSE,   2),
      ('Сироп',        'карамель',       1000,  'Сироп карамельний, порція',  '',          1,  FALSE,   0),
      ('Сироп',        'ваніль',         1000,  NULL,                         NULL,     NULL,  FALSE,   1),
      ('Сироп',        'лісовий горіх',  1000,  NULL,                         NULL,     NULL,  FALSE,   2),
      ('Цукор',        'з цукром',          0,  'Цукор',                      '',          5,  TRUE,    0),
      ('Цукор',        'без цукру',         0,  NULL,                         NULL,     NULL,  FALSE,   1),
      ('Порція',       'подвійна',       2000,  'Зерно арабіка',              '',         18,  FALSE,   0),
      ('Порція',       'половина',      -2000,  NULL,                         NULL,     NULL,  FALSE,   1),
      ('Температура',  'гарячіше',          0,  NULL,                         NULL,     NULL,  FALSE,   0),
      ('Температура',  'тепле',             0,  NULL,                         NULL,     NULL,  FALSE,   1)
    ) AS t(grp, answer, delta, part_product, part_label, qty, is_default, ord)
  LOOP
    SELECT id INTO v_group FROM pos_modifier_groups WHERE store_id = v_store AND name = c.grp;
    v_part := NULL;
    IF c.part_product IS NOT NULL THEN
      SELECT v.id INTO v_part
        FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = v_store AND p.name = c.part_product AND v.label = c.part_label;
      IF v_part IS NULL THEN
        RAISE EXCEPTION 'demo-cafe: no variant % / "%" for answer %',
          c.part_product, c.part_label, c.answer;
      END IF;
    END IF;

    INSERT INTO pos_modifiers
      (store_id, group_id, name, price_delta_cents, component_variant_id, component_quantity,
       is_default, sort_order)
    VALUES (v_store, v_group, c.answer, c.delta, v_part, c.qty, c.is_default, c.ord);
  END LOOP;

  -- Which drink asks which questions, in this order. Espresso's questions are
  -- all answered by a default, so a tap on its tile adds it as is; a latte
  -- has an optional syrup, reached through the tile's «⋯». Food asks nothing.
  FOR c IN
    SELECT * FROM (VALUES
      ('Еспресо',      'Цукор',        0), ('Еспресо',      'Порція',       1),
      ('Американо',    'Цукор',        0), ('Американо',    'Порція',       1), ('Американо',  'Температура', 2),
      ('Латте',        'Молоко',       0), ('Латте',        'Сироп',        1), ('Латте',      'Цукор',       2),
      ('Латте',        'Порція',       3), ('Латте',        'Температура',  4),
      ('Капучино',     'Молоко',       0), ('Капучино',     'Сироп',        1), ('Капучино',   'Цукор',       2),
      ('Капучино',     'Порція',       3), ('Капучино',     'Температура',  4),
      ('Флет вайт',    'Молоко',       0), ('Флет вайт',    'Цукор',        1),
      ('Раф',          'Молоко',       0), ('Раф',          'Сироп',        1), ('Раф',        'Цукор',       2),
      ('Раф',          'Температура',  3),
      ('Какао',        'Молоко',       0), ('Какао',        'Сироп',        1), ('Какао',      'Температура', 2),
      ('Чай чорний',   'Цукор',        0), ('Чай чорний',   'Температура',  1),
      ('Чай зелений',  'Цукор',        0), ('Чай зелений',  'Температура',  1)
    ) AS t(product, grp, ord)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = c.product AND sellable;
    SELECT id INTO v_group FROM pos_modifier_groups WHERE store_id = v_store AND name = c.grp;
    INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order)
    VALUES (v_store, v_prod, v_group, c.ord);
  END LOOP;

  -- ── What was made in advance ────────────────────────────────────────────
  -- A posted production document per `own` recipe, exactly what
  -- `produceComposite` writes: the components out, the assembled units in at
  -- the cost the components added up to. The sauce first — the sandwich's
  -- cost reads the sauce's, which this sets.
  FOR r IN
    SELECT * FROM (VALUES
      ('Соус сніданковий, порція', 40, 'Ранкова заготовка'),
      ('Сендвіч сніданковий',      12, 'Ранкове збирання')
    ) AS t(dish, qty, note)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = r.dish;

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
      NOW(), r.note, v_owner, v_owner, NOW()
    )
    RETURNING id INTO v_doc;

    INSERT INTO pos_stock_document_lines (document_id, store_id, variant_id, quantity, unit_cost_cents)
    VALUES (v_doc, v_store, v_variant, r.qty, v_unit_cost);

    FOR c IN
      SELECT pc.component_variant_id AS vid, pc.quantity AS per_unit
        FROM pos_product_components pc
       WHERE pc.variant_id = v_variant
       ORDER BY pc.sort_order, pc.id
    LOOP
      UPDATE pos_stock SET quantity = quantity - c.per_unit * r.qty, updated_at = NOW()
       WHERE variant_id = c.vid AND store_id = v_store;
      INSERT INTO pos_stock_movements
        (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id)
      VALUES (
        v_store, c.vid, -c.per_unit * r.qty, 'writeoff', 'stock_document', v_doc,
        r.note, v_owner
      );
    END LOOP;

    UPDATE pos_stock SET quantity = quantity + r.qty, updated_at = NOW()
     WHERE variant_id = v_variant AND store_id = v_store;
    INSERT INTO pos_stock_movements
      (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id, unit_cost_cents)
    VALUES (
      v_store, v_variant, r.qty, 'receipt', 'stock_document', v_doc,
      r.note, v_owner, v_unit_cost
    );
    UPDATE pos_variants SET cost_cents = v_unit_cost, updated_at = NOW() WHERE id = v_variant;
  END LOOP;

  INSERT INTO pos_store_counters (store_id, counter_key, next_value)
  VALUES (v_store, 'production_' || v_year, v_seq + 1)
  ON CONFLICT (store_id, counter_key) DO UPDATE SET next_value = EXCLUDED.next_value;

  -- ── The expanded recipes ────────────────────────────────────────────────
  -- 045 already ran this boot, before this store existed. Same SQL as
  -- `recomputeFlat`, for this store only: a `derived` component is folded in,
  -- an `own` one stays a leaf, duplicates add up.
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

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-cafe', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE 'demo-cafe store ready at version % (id %)', v_version, v_store;
END $$;
