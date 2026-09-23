-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 055_pos_demo_clothing_store.sql
-- The «Demo Clothing» store — the fourth demo, and the first for the vertical
-- every store had before verticals existed. Same shape as 039 (flowers), 048
-- (café) and 053 (restaurant): data in a migration rather than a seed script,
-- so it arrives with a deploy. `src/pos/seed.ts` still builds its own small
-- «Demo Boutique» for local work; that one uses PNGs in the uploads volume and
-- never reaches production, which is why the marketing site could not show a
-- clothing till of the same quality as the other three.
--
-- ⚠ READ BEFORE DEPLOYING. Like 039, this inserts DEMO DATA into every
-- database the runner touches, production included, with PUBLICLY KNOWN
-- credentials (owner@clothing.shop / owner123, owner PIN 0000, seller PIN
-- 1234). The accounts see only their own store. To drop it, delete the
-- transactional tables first in the order `dropTestStore` uses
-- (`src/__tests__/helpers/pos-fixtures.ts`), then the store row.
--
-- Idempotency is the stamp in `pos_demo_seed` (created by 039), compared with
-- `v_version` below: no store → build; stamp = v_version → no-op; stamp
-- older/absent → rebuild the catalogue, keeping the store row, its
-- configuration, its staff, customers and counters. Editing the VALUES lists
-- means bumping `v_version`. A rebuild deletes the demo's own sales, refunds
-- and stock documents — the header of 039 explains why that is the right
-- trade for a demo.
--
-- Pictures are flat SVGs under `public/demo-clothing/` (regenerate with
-- `node scripts/gen-demo-clothing.mjs public/demo-clothing`), one per product;
-- colour is a variant attribute, so the drawing uses the first variant's.
--
-- Variant captions are typed out by hand because SQL cannot call the
-- vertical's `labelOf` — clothing is `[color, size].join(' / ')`.
-- `src/__tests__/pos.demo-clothing.test.ts` re-derives every one through the
-- real vertical and fails if this file and `src/pos/verticals/clothing.ts`
-- disagree. Barcodes are EAN-13 with the check digit computed here, so every
-- variant scans; the same test verifies them with `verifyCheckDigit`.

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
  r            record;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-clothing';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-clothing';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE 'demo-clothing already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE 'demo-clothing at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only, in foreign-key order (see 039 / 048 for why each row is
    -- explicit). The clothing vertical has no tables, bills, modifiers or
    -- composites, but a store can still carry parked carts and pre-orders,
    -- and both RESTRICT the variants they point at.
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

    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES ('Demo Clothing', 'demo-clothing', 'UAH', 'Europe/Kyiv', 'clothing')
    RETURNING id INTO v_store;
  END IF;

  -- The same three bcrypt(10) digests every demo uses (owner123 / 0000 / 1234):
  -- one thing to remember, not four. Written only when the store has nobody —
  -- a rebuild never rotates anyone's credentials.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власниця', 'owner@clothing.shop',
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
      v_store, 'seller', 'Продавчиня Оля',
      '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'
    );
  END IF;

  -- ── Tags ────────────────────────────────────────────────────────────────
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar)
  VALUES
    (v_store, 'Футболки',      10, 'slate',  TRUE),
    (v_store, 'Худі та светри', 20, 'slate',  TRUE),
    (v_store, 'Джинси й штани', 30, 'blue',   TRUE),
    (v_store, 'Сорочки',        40, 'blue',   TRUE),
    (v_store, 'Сукні та спідниці', 50, 'rose', TRUE),
    (v_store, 'Верхній одяг',   60, 'green',  TRUE),
    (v_store, 'Взуття',         70, 'amber',  TRUE),
    (v_store, 'Аксесуари',      80, 'amber',  TRUE);

  -- ── Garments ────────────────────────────────────────────────────────────
  -- One row per variant; the product is created on its first row. `label`
  -- follows the clothing rule: color || ' / ' || size. `ean` is the 12-digit
  -- body of an EAN-13 under the Ukrainian 482 prefix — the check digit is
  -- computed below so the codes scan on a real reader.
  FOR r IN
    SELECT * FROM (VALUES
      -- product,               image,           tag,                color,          size,   sku,           ean12,           price,  cost,  qty
      ('Футболка базова',       'tee-basic',     'Футболки',         'Чорний',       'S',    'TEE-BLK-S',   '482000200001',  69000,  2800,  8),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Чорний',       'M',    'TEE-BLK-M',   '482000200002',  69000,  2800, 12),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Чорний',       'L',    'TEE-BLK-L',   '482000200003',  69000,  2800, 10),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Чорний',       'XL',   'TEE-BLK-XL',  '482000200004',  69000,  2800,  4),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Білий',        'S',    'TEE-WHT-S',   '482000200005',  69000,  2800,  6),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Білий',        'M',    'TEE-WHT-M',   '482000200006',  69000,  2800,  9),
      ('Футболка базова',       'tee-basic',     'Футболки',         'Білий',        'L',    'TEE-WHT-L',   '482000200007',  69000,  2800,  5),
      ('Футболка oversize',     'tee-oversize',  'Футболки',         'Бежевий',      'M',    'TEO-BEI-M',   '482000200008',  89000,  3600,  7),
      ('Футболка oversize',     'tee-oversize',  'Футболки',         'Бежевий',      'L',    'TEO-BEI-L',   '482000200009',  89000,  3600,  5),
      ('Футболка oversize',     'tee-oversize',  'Футболки',         'Графіт',       'M',    'TEO-GRA-M',   '482000200010',  89000,  3600,  6),
      ('Футболка oversize',     'tee-oversize',  'Футболки',         'Графіт',       'L',    'TEO-GRA-L',   '482000200011',  89000,  3600,  3),
      ('Худі',                  'hoodie',        'Худі та светри',   'Сірий',        'S',    'HOD-GRY-S',   '482000200012', 139000,  6100,  4),
      ('Худі',                  'hoodie',        'Худі та светри',   'Сірий',        'M',    'HOD-GRY-M',   '482000200013', 139000,  6100,  7),
      ('Худі',                  'hoodie',        'Худі та светри',   'Сірий',        'L',    'HOD-GRY-L',   '482000200014', 139000,  6100,  6),
      ('Худі',                  'hoodie',        'Худі та светри',   'Сірий',        'XL',   'HOD-GRY-XL',  '482000200015', 139000,  6100,  2),
      ('Худі',                  'hoodie',        'Худі та светри',   'Оливковий',    'M',    'HOD-OLV-M',   '482000200016', 139000,  6100,  5),
      ('Худі',                  'hoodie',        'Худі та светри',   'Оливковий',    'L',    'HOD-OLV-L',   '482000200017', 139000,  6100,  3),
      ('Світшот',               'sweatshirt',    'Худі та светри',   'Молочний',     'S',    'SWT-MLK-S',   '482000200018', 119000,  5200,  5),
      ('Світшот',               'sweatshirt',    'Худі та светри',   'Молочний',     'M',    'SWT-MLK-M',   '482000200019', 119000,  5200,  8),
      ('Світшот',               'sweatshirt',    'Худі та светри',   'Молочний',     'L',    'SWT-MLK-L',   '482000200020', 119000,  5200,  4),
      ('Джинси slim',           'jeans-slim',    'Джинси й штани',   'Синій',        '28',   'JNS-BLU-28',  '482000200021', 159000,  7000,  3),
      ('Джинси slim',           'jeans-slim',    'Джинси й штани',   'Синій',        '30',   'JNS-BLU-30',  '482000200022', 159000,  7000,  6),
      ('Джинси slim',           'jeans-slim',    'Джинси й штани',   'Синій',        '32',   'JNS-BLU-32',  '482000200023', 159000,  7000,  7),
      ('Джинси slim',           'jeans-slim',    'Джинси й штани',   'Синій',        '34',   'JNS-BLU-34',  '482000200024', 159000,  7000,  4),
      ('Джинси wide',           'jeans-wide',    'Джинси й штани',   'Світло-синій', '26',   'JNW-LBL-26',  '482000200025', 169000,  7400,  4),
      ('Джинси wide',           'jeans-wide',    'Джинси й штани',   'Світло-синій', '28',   'JNW-LBL-28',  '482000200026', 169000,  7400,  6),
      ('Джинси wide',           'jeans-wide',    'Джинси й штани',   'Світло-синій', '30',   'JNW-LBL-30',  '482000200027', 169000,  7400,  3),
      ('Штани карго',           'cargo',         'Джинси й штани',   'Хакі',         'M',    'CRG-KHK-M',   '482000200028', 149000,  6500,  5),
      ('Штани карго',           'cargo',         'Джинси й штани',   'Хакі',         'L',    'CRG-KHK-L',   '482000200029', 149000,  6500,  6),
      ('Штани карго',           'cargo',         'Джинси й штани',   'Хакі',         'XL',   'CRG-KHK-XL',  '482000200030', 149000,  6500,  2),
      ('Сорочка лляна',         'shirt-linen',   'Сорочки',          'Білий',        'S',    'SHR-WHT-S',   '482000200031', 129000,  5600,  4),
      ('Сорочка лляна',         'shirt-linen',   'Сорочки',          'Білий',        'M',    'SHR-WHT-M',   '482000200032', 129000,  5600,  7),
      ('Сорочка лляна',         'shirt-linen',   'Сорочки',          'Білий',        'L',    'SHR-WHT-L',   '482000200033', 129000,  5600,  5),
      ('Сорочка лляна',         'shirt-linen',   'Сорочки',          'Блакитний',    'M',    'SHR-SKY-M',   '482000200034', 129000,  5600,  4),
      ('Сорочка лляна',         'shirt-linen',   'Сорочки',          'Блакитний',    'L',    'SHR-SKY-L',   '482000200035', 129000,  5600,  3),
      ('Сукня міді',            'dress-midi',    'Сукні та спідниці','Теракотовий',  'XS',   'DRS-TER-XS',  '482000200036', 189000,  8300,  2),
      ('Сукня міді',            'dress-midi',    'Сукні та спідниці','Теракотовий',  'S',    'DRS-TER-S',   '482000200037', 189000,  8300,  4),
      ('Сукня міді',            'dress-midi',    'Сукні та спідниці','Теракотовий',  'M',    'DRS-TER-M',   '482000200038', 189000,  8300,  5),
      ('Сукня міді',            'dress-midi',    'Сукні та спідниці','Чорний',       'S',    'DRS-BLK-S',   '482000200039', 189000,  8300,  3),
      ('Сукня міді',            'dress-midi',    'Сукні та спідниці','Чорний',       'M',    'DRS-BLK-M',   '482000200040', 189000,  8300,  4),
      ('Спідниця плісе',        'skirt-pleated', 'Сукні та спідниці','Бежевий',      'S',    'SKR-BEI-S',   '482000200041', 119000,  5200,  4),
      ('Спідниця плісе',        'skirt-pleated', 'Сукні та спідниці','Бежевий',      'M',    'SKR-BEI-M',   '482000200042', 119000,  5200,  6),
      ('Спідниця плісе',        'skirt-pleated', 'Сукні та спідниці','Бежевий',      'L',    'SKR-BEI-L',   '482000200043', 119000,  5200,  3),
      ('Куртка бомбер',         'jacket-bomber', 'Верхній одяг',     'Оливковий',    'M',    'BMB-OLV-M',   '482000200044', 249000, 11000,  3),
      ('Куртка бомбер',         'jacket-bomber', 'Верхній одяг',     'Оливковий',    'L',    'BMB-OLV-L',   '482000200045', 249000, 11000,  4),
      ('Куртка бомбер',         'jacket-bomber', 'Верхній одяг',     'Оливковий',    'XL',   'BMB-OLV-XL',  '482000200046', 249000, 11000,  2),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '37',   'SNK-WHT-37',  '482000200047', 219000,  9700,  3),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '38',   'SNK-WHT-38',  '482000200048', 219000,  9700,  5),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '39',   'SNK-WHT-39',  '482000200049', 219000,  9700,  6),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '40',   'SNK-WHT-40',  '482000200050', 219000,  9700,  5),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '41',   'SNK-WHT-41',  '482000200051', 219000,  9700,  4),
      ('Кросівки',              'sneakers',      'Взуття',           'Білий',        '42',   'SNK-WHT-42',  '482000200052', 219000,  9700,  2),
      ('Кепка',                 'cap',           'Аксесуари',        'Чорний',       'Універсальний', 'CAP-BLK', '482000200053', 59000, 2400, 12),
      ('Шкарпетки',             'socks',         'Аксесуари',        'Білий',        '36–40', 'SCK-WHT-S',  '482000200054',  19000,   700, 30),
      ('Шкарпетки',             'socks',         'Аксесуари',        'Білий',        '41–45', 'SCK-WHT-L',  '482000200055',  19000,   700, 24),
      ('Ремінь шкіряний',       'belt',          'Аксесуари',        'Коричневий',   '90',   'BLT-BRN-90',  '482000200056',  79000,  3300,  5),
      ('Ремінь шкіряний',       'belt',          'Аксесуари',        'Коричневий',   '100',  'BLT-BRN-100', '482000200057',  79000,  3300,  4),
      ('Сумка шопер',           'bag-tote',      'Аксесуари',        'Бежевий',      'Універсальний', 'BAG-BEI', '482000200058', 99000, 4200,  7)
    ) AS t(name, image, tag, color, size, sku, ean12, price, cost, qty)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.name;
    IF v_prod IS NULL THEN
      INSERT INTO pos_products (store_id, name, image_url, kind, stock_mode)
      VALUES (v_store, r.name, '/demo-clothing/' || r.image || '.svg', 'simple', 'own')
      RETURNING id INTO v_prod;
      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = r.tag;
    END IF;

    -- EAN-13 check digit: weights 1,3,1,3… over the 12 body digits.
    v_body := r.ean12;
    v_sum := 0;
    FOR v_i IN 1..12 LOOP
      v_sum := v_sum + substr(v_body, v_i, 1)::int * CASE WHEN v_i % 2 = 0 THEN 3 ELSE 1 END;
    END LOOP;
    v_barcode := v_body || ((10 - v_sum % 10) % 10)::text;

    INSERT INTO pos_variants
      (store_id, product_id, attributes, label, unit, sku, barcode, price_cents, cost_cents)
    VALUES (
      v_store, v_prod,
      jsonb_build_object('color', r.color, 'size', r.size),
      r.color || ' / ' || r.size,
      'шт', r.sku, v_barcode, r.price, r.cost
    )
    RETURNING id INTO v_variant;

    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
    VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
    v_seq := v_seq + 1;
  END LOOP;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-clothing', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE 'demo-clothing store ready at version % (id %, % variants)', v_version, v_store, v_seq;
END $$;
