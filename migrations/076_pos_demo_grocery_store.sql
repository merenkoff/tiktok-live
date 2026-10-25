-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 076_pos_demo_grocery_store.sql
-- The «Demo Grocery» store — the fifth demo, and the first on the grocery
-- vertical (TechDocs/grocery/G4_WEIGHED.md §6). Same shape as 039 (flowers),
-- 048 (café), 053 (restaurant) and 055 (clothing): data in a migration rather
-- than a seed script, so it arrives with a deploy and the marketing site can
-- show a grocery till of the same quality as the other four.
--
-- ⚠ READ BEFORE DEPLOYING. Like 039, this inserts DEMO DATA into every
-- database the runner touches, production included, with PUBLICLY KNOWN
-- credentials (owner@grocery.shop / owner123, owner PIN 0000, seller PIN
-- 1234). The accounts see only their own store. To drop it, delete the
-- transactional tables first in the order `dropTestStore` uses
-- (`src/__tests__/helpers/pos-fixtures.ts`), then the store row.
--
-- Idempotency is the stamp in `pos_demo_seed` (created by 039), compared with
-- `v_version` below: no store → build; stamp = v_version → no-op; stamp
-- older/absent → rebuild the catalogue, keeping the store row, its
-- configuration (`module_remotes` above all, which this file never writes),
-- its staff, customers and counters. Editing the VALUES list means bumping
-- `v_version`. A rebuild deletes the demo's own sales, refunds, debts and
-- stock documents — the header of 039 explains why that is the right trade
-- for a demo.
--
-- Two kinds of goods, the way a corner shop has them:
--  - WEIGHED (unit 'г' or 'мл', `price_per` 1000 — migration 075): cheese,
--    sausage, vegetables, fruit, sweets, draught kvass. `price` is per
--    kilogram or litre, `qty` is grams or millilitres on the shelf, and
--    `cost` is per gram or millilitre — the one known coarseness of 075
--    (1 коп/г is 10 ₴/кг, so a purchase price lands on a 10 ₴/кг step). Their
--    barcodes are the shop's own `29…` codes, minted from the same sequence
--    `generateInternalBarcode` uses, because that is what a weighed good's
--    price tag carries (and scanning it opens the weight pad).
--  - PACKED (unit 'шт'): milk, bread, groceries — EAN-13 under the Ukrainian
--    482 prefix with the check digit computed here, so every one scans.
--
-- Variant captions are typed out by hand because SQL cannot call the
-- vertical's `labelOf` — groceries are `[variety, packaging].join(' · ')`.
-- `src/__tests__/pos.demo-grocery.test.ts` re-derives every one through the
-- real vertical (and `price_per` through `normalizeVariant`), and fails if
-- this file and `src/pos/verticals/grocery.ts` disagree.
--
-- Pictures are flat SVGs under `public/demo-grocery/` (regenerate with
-- `node scripts/gen-demo-grocery.mjs public/demo-grocery`), one per product.
-- No `module_remotes` entry: the `vertical-grocery` bundle URL is a
-- deployment choice (`POS_SEED_VERTICAL_GROCERY=1 npm run pos:seed` for local
-- work, the super admin for a real one) — without it the till sells through
-- the bundled catalog, which knows weighed goods too.

DO $$
DECLARE
  -- Bump when the catalogue below changes. The header says what that does.
  v_version CONSTANT int := 1;
  v_stamped    int;
  v_store      bigint;
  v_owner      bigint;
  v_prod       bigint;
  v_variant    bigint;
  v_seq        int := 0;
  v_body       text;
  v_sum        int;
  v_i          int;
  v_barcode    text;
  v_attrs      jsonb;
  r            record;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-grocery';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-grocery';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE 'demo-grocery already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE 'demo-grocery at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only, in foreign-key order (see 039 / 053 / 055 for why each row
    -- is explicit). A grocery has no tables or modifiers of its own, but the
    -- routes behind both are core ones a visitor of a public demo can reach,
    -- and a failed rebuild keeps the API from starting — so everything that
    -- RESTRICTs a variant goes, whether or not the screens offer it: bills,
    -- goods given «під запис» (073 — created earlier in the list, so no guard
    -- is needed here), parked carts, pre-orders and modifiers.
    DELETE FROM pos_bill_item_components WHERE store_id = v_store;
    DELETE FROM pos_bill_items WHERE store_id = v_store;
    DELETE FROM pos_bill_rounds WHERE store_id = v_store;
    DELETE FROM pos_bills WHERE store_id = v_store;
    DELETE FROM pos_debt_entry_lines WHERE store_id = v_store;
    DELETE FROM pos_debt_item_components WHERE store_id = v_store;
    DELETE FROM pos_debt_items WHERE store_id = v_store;
    DELETE FROM pos_debt_entries WHERE store_id = v_store;
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
    DELETE FROM pos_stock_reservations WHERE store_id = v_store;
    DELETE FROM pos_parked_cart_items WHERE store_id = v_store;
    DELETE FROM pos_parked_carts WHERE store_id = v_store;
    DELETE FROM pos_preorder_items WHERE store_id = v_store;
    DELETE FROM pos_preorders WHERE store_id = v_store;
    -- A markdown campaign's items go with their variants; the campaign row
    -- would be left naming nothing.
    DELETE FROM pos_markdowns WHERE store_id = v_store;
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

    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES ('Demo Grocery', 'demo-grocery', 'UAH', 'Europe/Kyiv', 'grocery')
    RETURNING id INTO v_store;
  END IF;

  -- The same three bcrypt(10) digests every demo uses (owner123 / 0000 / 1234):
  -- one thing to remember, not five. Written only when the store has nobody —
  -- a rebuild never rotates anyone's credentials.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власник', 'owner@grocery.shop',
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
      v_store, 'seller', 'Продавчиня Галина',
      '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'
    );
  END IF;

  -- ── Tags ────────────────────────────────────────────────────────────────
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar)
  VALUES
    (v_store, 'Овочі й фрукти', 10, 'green',  TRUE),
    (v_store, 'Сири',           20, 'amber',  TRUE),
    (v_store, 'Ковбаси',        30, 'rose',   TRUE),
    (v_store, 'Молочне й яйця', 40, 'blue',   TRUE),
    (v_store, 'Хліб',           50, 'orange', TRUE),
    (v_store, 'Бакалія',        60, 'slate',  TRUE),
    (v_store, 'Солодощі',       70, 'purple', TRUE),
    (v_store, 'Напої',          80, 'teal',   TRUE);

  -- ── Goods ───────────────────────────────────────────────────────────────
  -- One row per variant; the product is created on its first row. `ean12` is
  -- the 12-digit body of a packed good's EAN-13 (482 prefix), NULL for a
  -- weighed one, which gets the shop's own `29…` code instead. `price` is per
  -- piece, or per kilogram/litre for a weighed good; `cost` is per piece, or
  -- per gram/millilitre; `qty` is pieces, or grams/millilitres.
  FOR r IN
    SELECT * FROM (VALUES
      -- product,                       image,            tag,              variety,        packaging, unit, sku,          ean12,          price, cost,  qty
      ('Сир твердий',                   'cheese',         'Сири',           'Гауда',        NULL,      'г',  'CHS-GOUDA',  NULL,           18990,   13,  5200),
      ('Сир твердий',                   'cheese',         'Сири',           'Голландський', NULL,      'г',  'CHS-DUTCH',  NULL,           21990,   15,  3800),
      ('Ковбаса варена «Лікарська»',    'sausage-boiled', 'Ковбаси',        NULL,           NULL,      'г',  'SSG-LIK',    NULL,           26990,   19,  4500),
      ('Салямі сирокопчена',            'salami',         'Ковбаси',        NULL,           NULL,      'г',  'SSG-SAL',    NULL,           52990,   38,  2600),
      ('Картопля',                      'potato',         'Овочі й фрукти', NULL,           NULL,      'г',  'VEG-POT',    NULL,            2490,    1, 80000),
      ('Морква',                        'carrot',         'Овочі й фрукти', NULL,           NULL,      'г',  'VEG-CAR',    NULL,            2290,    1, 25000),
      ('Цибуля ріпчаста',               'onion',          'Овочі й фрукти', NULL,           NULL,      'г',  'VEG-ONI',    NULL,            1990,    1, 30000),
      ('Помідори',                      'tomato',         'Овочі й фрукти', NULL,           NULL,      'г',  'VEG-TOM',    NULL,            8990,    6, 12000),
      ('Огірки',                        'cucumber',       'Овочі й фрукти', NULL,           NULL,      'г',  'VEG-CUC',    NULL,            7490,    5, 10000),
      ('Яблука',                        'apple',          'Овочі й фрукти', 'Голден',       NULL,      'г',  'FRT-APL-GLD', NULL,           3990,    3, 40000),
      ('Яблука',                        'apple',          'Овочі й фрукти', 'Гала',         NULL,      'г',  'FRT-APL-GAL', NULL,           4490,    3, 30000),
      ('Банани',                        'banana',         'Овочі й фрукти', NULL,           NULL,      'г',  'FRT-BAN',    NULL,            6990,    5, 18000),
      ('Цукерки «Ромашка»',             'candy',          'Солодощі',       NULL,           NULL,      'г',  'SWT-ROM',    NULL,           17990,   13,  6000),
      ('Квас розливний',                'kvass',          'Напої',          NULL,           NULL,      'мл', 'DRK-KVS',    NULL,            3490,    2, 50000),
      ('Молоко «Ферма»',                'milk',           'Молочне й яйця', '2,5 %',        '900 г',   'шт', 'MLK-25',     '482000300001',  4690, 3700,    24),
      ('Молоко «Ферма»',                'milk',           'Молочне й яйця', '3,2 %',        '900 г',   'шт', 'MLK-32',     '482000300002',  4990, 3900,    18),
      ('Кефір',                         'kefir',          'Молочне й яйця', '2,5 %',        '900 г',   'шт', 'KFR-25',     '482000300003',  4590, 3600,    12),
      ('Масло вершкове',                'butter',         'Молочне й яйця', '82 %',         '200 г',   'шт', 'BTR-82',     '482000300004',  8990, 7000,    20),
      ('Яйця курячі',                   'eggs',           'Молочне й яйця', 'С1',           '10 шт',   'шт', 'EGG-C1-10',  '482000300005',  6490, 5000,    30),
      ('Хліб житній',                   'bread-rye',      'Хліб',           NULL,           '700 г',   'шт', 'BRD-RYE',    '482000300006',  3290, 2400,    15),
      ('Батон нарізний',                'loaf',           'Хліб',           NULL,           '500 г',   'шт', 'BRD-LOAF',   '482000300007',  2890, 2100,    20),
      ('Крупа гречана',                 'buckwheat',      'Бакалія',        NULL,           '1 кг',    'шт', 'GRC-BCK',    '482000300008',  6990, 5500,    15),
      ('Цукор',                         'sugar',          'Бакалія',        NULL,           '1 кг',    'шт', 'GRC-SGR',    '482000300009',  3990, 3100,    25),
      ('Олія соняшникова',              'oil',            'Бакалія',        'рафінована',   '0,85 л',  'шт', 'GRC-OIL',    '482000300010',  7490, 5900,    18),
      ('Вода мінеральна',               'water',          'Напої',          'негазована',   '1,5 л',   'шт', 'DRK-WTR',    '482000300011',  2490, 1700,    48)
    ) AS t(name, image, tag, variety, packaging, unit, sku, ean12, price, cost, qty)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.name;
    IF v_prod IS NULL THEN
      INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode)
      VALUES (v_store, r.name, '/demo-grocery/' || r.image || '.svg', 'simple', 'own')
      RETURNING id INTO v_prod;
      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;
    END IF;

    -- A packed good scans by the maker's code; a weighed one carries the
    -- shop's own, from the sequence the server mints from.
    IF r.ean12 IS NOT NULL THEN
      v_body := r.ean12;
    ELSE
      v_body := '29' || lpad(nextval('pos_internal_barcode_seq')::text, 10, '0');
    END IF;
    -- EAN-13 check digit: weights 1,3,1,3… over the 12 body digits.
    v_sum := 0;
    FOR v_i IN 1..12 LOOP
      v_sum := v_sum + substr(v_body, v_i, 1)::int * CASE WHEN v_i % 2 = 0 THEN 3 ELSE 1 END;
    END LOOP;
    v_barcode := v_body || ((10 - v_sum % 10) % 10)::text;

    -- Only the attributes a variant has, as `normalizeVariant` stores them.
    v_attrs := jsonb_strip_nulls(jsonb_build_object('variety', r.variety, 'packaging', r.packaging));

    INSERT INTO pos_variants
      (store_id, product_id, attributes, label, unit, price_per, sku, barcode, price_cents, cost_cents)
    VALUES (
      v_store, v_prod, v_attrs,
      concat_ws(' · ', r.variety, r.packaging),
      r.unit,
      CASE WHEN r.unit IN ('г', 'мл') THEN 1000 ELSE 1 END,
      r.sku, v_barcode, r.price, r.cost
    )
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
    v_seq := v_seq + 1;
  END LOOP;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-grocery', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE 'demo-grocery store ready at version % (id %, % variants)', v_version, v_store, v_seq;
END $$;
