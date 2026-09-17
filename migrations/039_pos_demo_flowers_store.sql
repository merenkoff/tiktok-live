-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 039_pos_demo_flowers_store.sql
-- The «Demo Flowers» store, as data rather than a seed script, so it arrives
-- with a deploy instead of needing someone to run `pos:seed` by hand.
-- See TechDocs/POS_VERTICALS.md §7i.
--
-- ⚠ READ BEFORE DEPLOYING. This is the one migration in the repo that inserts
-- DEMO DATA, not schema, and it runs against every database the migration
-- runner touches — production included. It creates a real store with
-- PUBLICLY KNOWN credentials (owner@flowers.shop / owner123, owner PIN 0000,
-- seller PIN 1234). Those accounts see only their own store (every POS query is
-- scoped by `store_id`), but they are real logins. To drop it afterwards, delete
-- the transactional tables first and let the cascade take the rest:
--
--   BEGIN;
--   WITH s AS (SELECT id FROM pos_stores WHERE slug = 'demo-flowers')
--   DELETE FROM pos_fiscal_receipts      WHERE store_id IN (SELECT id FROM s);
--   -- …then refunds, sales, stock documents, as `dropTestStore` does…
--   DELETE FROM pos_stores WHERE slug = 'demo-flowers';
--   COMMIT;
--
-- A bare `DELETE FROM pos_stores` looks like it works — it does on a demo
-- nobody has sold from — but `pos_sale_items`, `pos_refund_items` and
-- `pos_stock_document_lines` hold their variant with ON DELETE RESTRICT, and
-- PostgreSQL checks that while the cascade is still running. The ordered
-- version lives twice in this repo already: the rebuild block below, and
-- `dropTestStore` in `src/__tests__/helpers/pos-fixtures.ts`.
--
-- Idempotency works off a stamp, not off "does the store exist". The runner
-- keeps no tracking table and re-applies every file on every boot
-- (`src/pos/migrate.ts`), so this file records which build of the demo a
-- database already has in `pos_demo_seed` and compares it with `v_version`:
--
--   * no store           -> build it, stamp it;
--   * stamp = v_version  -> return immediately (the no-op on every boot);
--   * stamp older/absent -> rebuild the catalogue, stamp it.
--
-- So editing the VALUES lists below means bumping `v_version`, and nothing else
-- reaches a database that already has the demo. The third case is also how a
-- store that predates this migration — created by `pos:seed`, which used to own
-- the demo — gets the full catalogue.
--
-- ⚠ A rebuild REPLACES this store's catalogue and DELETES the demo's own sales,
-- refunds and stock documents. A demo's history is not worth keeping, and the
-- alternative (skip when sales exist) means the update never reaches a demo
-- anyone actually used. Nothing outside `store_id` is touched. What survives:
-- the store row with all its configuration (`vertical`, `enabled_modules`,
-- `module_remotes`, `nav_overrides`, QR and fiscal settings), its staff, its
-- customers and its receipt counters. `module_remotes` is the concrete reason —
-- it points at a real `vertical-flowers` release that the super admin set, a
-- migration must never write a module URL, and a demo that lost it would fall
-- back to the bundled clothing catalogue.
--
-- Pictures are flat SVGs under `public/demo-flowers/` (regenerate with
-- `node scripts/gen-demo-flowers.mjs public/demo-flowers`). `public/` is
-- already served at `/`, so they ship inside the image: no upload volume, and
-- no 90 KB of base64 in here.
--
-- Variant captions are written out by hand because SQL cannot call the
-- vertical's `labelOf`. `src/__tests__/pos.demo-flowers.test.ts` re-derives
-- every one of them through the real flowers rule and fails if this file and
-- `src/pos/verticals/flowers.ts` ever disagree.

-- Which build of a demo dataset a database carries. Its own table rather than a
-- column on `pos_stores`: that row is the owner's to edit, this is the
-- migration's bookkeeping, and the next demo store can stamp itself here too.
CREATE TABLE IF NOT EXISTS pos_demo_seed (
  slug       TEXT PRIMARY KEY,
  version    INT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  -- Bump when the catalogue below changes. The header says what that does.
  v_version CONSTANT int := 1;
  v_stamped    int;
  v_store      bigint;
  v_owner      bigint;
  v_year       int := EXTRACT(YEAR FROM NOW())::int;
  v_doc        bigint;
  v_prod       bigint;
  v_variant    bigint;
  v_part       bigint;
  r            record;
  c            record;
  v_unit_cost  int;
  v_seq        int := 0;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-flowers';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-flowers';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE 'demo-flowers already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE 'demo-flowers at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only; the store row and its configuration stay (see the header).
    -- The order follows the foreign keys: `pos_variants` is RESTRICTed by
    -- `pos_sale_items`, `pos_refund_items` and `pos_stock_document_lines`, and
    -- `pos_sales` / `pos_refunds` by `pos_fiscal_receipts`, so those go first.
    -- The rest would cascade, but deleting explicitly is what makes the order
    -- provable instead of dependent on the order PostgreSQL happens to walk a
    -- cascade in.
    DELETE FROM pos_fiscal_receipts WHERE store_id = v_store;
    DELETE FROM pos_refund_items
     WHERE refund_id IN (SELECT id FROM pos_refunds WHERE store_id = v_store);
    DELETE FROM pos_refunds WHERE store_id = v_store;
    DELETE FROM pos_payments WHERE store_id = v_store;
    DELETE FROM pos_sale_item_components WHERE store_id = v_store;
    DELETE FROM pos_sale_items WHERE store_id = v_store;
    DELETE FROM pos_sales WHERE store_id = v_store;
    -- Otherwise a replayed `client_uuid` answers with a sale that is gone.
    DELETE FROM pos_idempotency_keys WHERE store_id = v_store;
    DELETE FROM pos_stock_document_lines WHERE store_id = v_store;
    DELETE FROM pos_stock_documents WHERE store_id = v_store;
    DELETE FROM pos_product_components WHERE store_id = v_store;
    DELETE FROM pos_variant_barcode_fixes WHERE store_id = v_store;
    DELETE FROM pos_stock_movements WHERE store_id = v_store;
    DELETE FROM pos_stock WHERE store_id = v_store;
    DELETE FROM pos_product_tags
     WHERE product_id IN (SELECT id FROM pos_products WHERE store_id = v_store);
    DELETE FROM pos_variants WHERE store_id = v_store;
    DELETE FROM pos_products WHERE store_id = v_store;
    DELETE FROM pos_tags WHERE store_id = v_store;

    -- The documents below are signed by the owner this store already has: a
    -- rebuild never rewrites anyone's credentials. A store somehow left without
    -- an active owner falls through to the insert below and gets the documented
    -- one.
    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES ('Demo Flowers', 'demo-flowers', 'UAH', 'Europe/Kyiv', 'flowers')
    RETURNING id INTO v_store;
  END IF;

  -- bcrypt(10) digests of owner123 / 0000 / 1234, precomputed because SQL has
  -- no bcrypt. `pos.demo-flowers.test.ts` verifies them against the real
  -- `verifyPassword`/`verifyPin`, so a rotten paste cannot go unnoticed.
  --
  -- Only when the store has nobody: a rebuild leaves the staff it finds alone,
  -- credentials included. Whoever manages the demo may have rotated the PIN,
  -- and a catalogue update is no reason to hand it back to the internet.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власниця', 'owner@flowers.shop',
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
      v_store, 'seller', 'Флористка Ніна',
      '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'
    );
  END IF;

  -- ── Tags ────────────────────────────────────────────────────────────────
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar)
  VALUES
    (v_store, 'Букети',    10, 'rose',   TRUE),
    (v_store, 'Троянди',   20, 'rose',   TRUE),
    (v_store, 'Сезонні',   30, 'amber',  TRUE),
    (v_store, 'Зелень',    40, 'green',  TRUE),
    (v_store, 'Пакування', 50, 'slate',  FALSE);

  -- ── Stems, greenery and consumables ─────────────────────────────────────
  -- `label` follows the flowers rule: [color, "N см"] joined by ' · '.
  -- `attributes` keys are the schema's (length_cm / color / country); jsonb
  -- compares key-wise, so the order they are written in here does not matter.
  FOR r IN
    SELECT * FROM (VALUES
      -- product name,                image,                   tag,          color,        len,  country,        price,  cost,   qty
      ('Троянда Freedom',             'rose-freedom',           'Троянди',   'Червона',     50,  'Еквадор',       7500,  3400,  120),
      ('Троянда Freedom',             'rose-freedom',           'Троянди',   'Червона',     60,  'Еквадор',       9000,  4000,   90),
      ('Троянда Freedom',             'rose-freedom',           'Троянди',   'Червона',     70,  'Еквадор',      11000,  5000,   40),
      ('Троянда Avalanche',           'rose-avalanche',         'Троянди',   'Біла',        60,  'Еквадор',       9500,  4300,   60),
      ('Троянда Avalanche',           'rose-avalanche',         'Троянди',   'Біла',        70,  'Еквадор',      11500,  5200,   35),
      ('Троянда Mondial',             'rose-mondial',           'Троянди',   'Кремова',     60,  'Еквадор',      10000,  4500,   45),
      ('Троянда кущова Bombastic',    'rose-spray-bombastic',   'Троянди',   'Рожева',      50,  'Кенія',        13000,  6000,   30),
      ('Тюльпан Dynasty',             'tulip-pink',             'Сезонні',   'Рожевий',     40,  'Нідерланди',    4500,  2000,  200),
      ('Тюльпан Strong Gold',         'tulip-yellow',           'Сезонні',   'Жовтий',      40,  'Нідерланди',    4500,  2000,  150),
      ('Хризантема кущова',           'chrysanthemum',          'Сезонні',   'Жовта',       55,  'Україна',       6500,  2900,   80),
      ('Хризантема кущова',           'chrysanthemum',          'Сезонні',   'Біла',        55,  'Україна',       6500,  2900,   70),
      ('Еустома',                     'eustoma',                'Сезонні',   'Біла',        55,  'Україна',       8500,  3800,   55),
      ('Гіпсофіла',                   'gypsophila',             'Зелень',    'Біла',        50,  'Україна',       7000,  3000,   90),
      ('Альстромерія',                'alstroemeria',           'Сезонні',   'Рожева',      60,  'Колумбія',      6000,  2700,   75),
      ('Півонія',                     'peony',                  'Сезонні',   'Рожева',      50,  'Нідерланди',   18000,  8500,   24),
      ('Ранункулюс',                  'ranunculus',             'Сезонні',   'Персиковий',  40,  'Італія',        9500,  4400,   40),
      ('Гортензія',                   'hydrangea',              'Сезонні',   'Блакитна',    50,  'Нідерланди',   22000, 10500,   18),
      ('Евкаліпт',                    'eucalyptus',             'Зелень',    'Зелений',     50,  'Україна',       5500,  2400,  100),
      ('Рускус',                      'ruscus',                 'Зелень',    'Зелений',     60,  'Італія',        4500,  1900,   85),
      ('Статиця',                     'statice',                'Зелень',    'Бузкова',     45,  'Україна',       5000,  2200,   60)
    ) AS t(name, image, tag, color, len, country, price, cost, qty)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.name;
    IF v_prod IS NULL THEN
      INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode)
      VALUES (v_store, r.name, '/demo-flowers/' || r.image || '.svg', 'simple', 'own')
      RETURNING id INTO v_prod;
      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;
    END IF;

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (
      v_store, v_prod,
      jsonb_build_object('length_cm', r.len, 'color', r.color, 'country', r.country),
      r.color || ' · ' || r.len || ' см',
      'шт', r.price, r.cost
    )
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
  END LOOP;

  -- Consumables carry no vertical attributes, so their caption is empty and the
  -- product name is the whole of it.
  FOR r IN
    SELECT * FROM (VALUES
      ('Крафт-пакування',    'kraft',  4000, 1500,  90),
      ('Стрічка атласна',    'ribbon', 2500,  900, 120),
      ('Флористична губка',  'foam',   6000, 2600,  40)
    ) AS t(name, image, price, cost, qty)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode)
    VALUES (v_store, r.name, '/demo-flowers/' || r.image || '.svg', 'simple', 'own')
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Пакування';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', 'шт', r.price, r.cost)
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
  END LOOP;

  -- ── Bouquets ────────────────────────────────────────────────────────────
  -- `derived` is assembled when it sells: no stock of its own, availability is
  -- whatever the components allow. `own` is assembled in advance — the
  -- production documents below take its stems off the shelf.
  FOR r IN
    SELECT * FROM (VALUES
      ('Букет «Ніжність»',        'bouquet-tenderness', 'derived', 'Червоний',      115000),
      ('Букет «Класика 25»',      'bouquet-classic25',  'derived', 'Червоний',      210000),
      ('Букет «Літній настрій»',  'bouquet-summer',     'derived', 'Різнобарвний',  135000),
      ('Букет «Ранкова свіжість»','bouquet-morning',    'own',     'Рожевий',        68000),
      ('Букет «Комплімент»',      'bouquet-compliment', 'own',     'Рожевий',        79000)
    ) AS t(name, image, mode, color, price)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode)
    VALUES (v_store, r.name, '/demo-flowers/' || r.image || '.svg', 'composite', r.mode)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Букети';

    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, jsonb_build_object('color', r.color), r.color, 'шт', r.price, 0)
    RETURNING id INTO v_variant;

    -- Every variant owns a stock row; for a derived composite it simply stays
    -- at 0 and nothing ever reads it.
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;

  -- ── Compositions ────────────────────────────────────────────────────────
  FOR c IN
    SELECT * FROM (VALUES
      ('Букет «Ніжність»',         'Троянда Freedom',     'Червона · 60 см',  9, 0),
      ('Букет «Ніжність»',         'Евкаліпт',            'Зелений · 50 см',  3, 1),
      ('Букет «Ніжність»',         'Крафт-пакування',     '',                 1, 2),
      ('Букет «Класика 25»',       'Троянда Freedom',     'Червона · 50 см', 25, 0),
      ('Букет «Класика 25»',       'Крафт-пакування',     '',                 1, 1),
      ('Букет «Класика 25»',       'Стрічка атласна',     '',                 1, 2),
      ('Букет «Літній настрій»',   'Еустома',             'Біла · 55 см',     7, 0),
      ('Букет «Літній настрій»',   'Хризантема кущова',   'Жовта · 55 см',    5, 1),
      ('Букет «Літній настрій»',   'Статиця',             'Бузкова · 45 см',  4, 2),
      ('Букет «Літній настрій»',   'Крафт-пакування',     '',                 1, 3),
      ('Букет «Ранкова свіжість»', 'Тюльпан Dynasty',     'Рожевий · 40 см', 11, 0),
      ('Букет «Ранкова свіжість»', 'Евкаліпт',            'Зелений · 50 см',  3, 1),
      ('Букет «Ранкова свіжість»', 'Крафт-пакування',     '',                 1, 2),
      ('Букет «Комплімент»',       'Альстромерія',        'Рожева · 60 см',   9, 0),
      ('Букет «Комплімент»',       'Рускус',              'Зелений · 60 см',  5, 1),
      ('Букет «Комплімент»',       'Крафт-пакування',     '',                 1, 2),
      ('Букет «Комплімент»',       'Стрічка атласна',     '',                 1, 3)
    ) AS t(bouquet, part_product, part_label, qty, ord)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.bouquet;

    -- Components are looked up by the caption written above, so a caption that
    -- drifts from the flowers rule fails the migration here rather than
    -- quietly building a bouquet out of nothing.
    SELECT v.id INTO v_part
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.part_product AND v.label = c.part_label;
    IF v_part IS NULL THEN
      RAISE EXCEPTION 'demo-flowers: no variant % / "%" for bouquet %',
        c.part_product, c.part_label, c.bouquet;
    END IF;

    INSERT INTO pos_product_components
      (store_id, variant_id, component_variant_id, quantity, sort_order)
    VALUES (v_store, v_variant, v_part, c.qty, c.ord);
  END LOOP;

  -- ── The two ready bouquets were actually assembled ──────────────────────
  -- Not a fudged stock number: a posted production document per bouquet, with
  -- the component write-offs and the receipt of the assembled item, exactly
  -- what `produceComposite` writes. That is what makes the demo's arithmetic
  -- add up — the stems on the shelf are the delivered amount minus what went
  -- into the fridge.
  FOR r IN
    SELECT * FROM (VALUES
      ('Букет «Ранкова свіжість»', 4),
      ('Букет «Комплімент»',       6)
    ) AS t(bouquet, qty)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = r.bouquet;

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
      NOW(), 'Ранкове збирання', v_owner, v_owner, NOW()
    )
    RETURNING id INTO v_doc;

    INSERT INTO pos_stock_document_lines (document_id, store_id, variant_id, quantity, unit_cost_cents)
    VALUES (v_doc, v_store, v_variant, r.qty, v_unit_cost);

    -- Components out.
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
        'Ранкове збирання', v_owner
      );
    END LOOP;

    -- Assembled bouquets in, at the cost their stems added up to.
    UPDATE pos_stock SET quantity = quantity + r.qty, updated_at = NOW()
     WHERE variant_id = v_variant AND store_id = v_store;
    INSERT INTO pos_stock_movements
      (store_id, variant_id, delta, reason, reference_type, reference_id, note, staff_id, unit_cost_cents)
    VALUES (
      v_store, v_variant, r.qty, 'receipt', 'stock_document', v_doc,
      'Ранкове збирання', v_owner, v_unit_cost
    );
    UPDATE pos_variants SET cost_cents = v_unit_cost, updated_at = NOW() WHERE id = v_variant;
  END LOOP;

  -- The next production document the app numbers must not collide with ours.
  -- Overwritten rather than kept on a rebuild: the documents it counted are
  -- gone with the catalogue, so the numbers are free again. The receipt
  -- counters are left alone — numbering never walks backwards.
  INSERT INTO pos_store_counters (store_id, counter_key, next_value)
  VALUES (v_store, 'production_' || v_year, v_seq + 1)
  ON CONFLICT (store_id, counter_key) DO UPDATE SET next_value = EXCLUDED.next_value;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-flowers', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE 'demo-flowers store ready at version % (id %)', v_version, v_store;
END $$;
