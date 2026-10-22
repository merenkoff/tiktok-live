-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 069_pos_cash_demo_stores.sql
-- Four playgrounds for a reseller, one per vertical: `cash-demo-clothing`,
-- `cash-demo-flowers`, `cash-demo-cafe`, `cash-demo-restaurant` (2026-10-22).
-- They exist so someone can learn the POS, change anything, sell, refund and
-- break it without touching the four demo stores the marketing site
-- screenshots and links to.
--
-- ⚠ READ BEFORE DEPLOYING. Like 039/048/053/055 this inserts DEMO DATA into
-- every database the runner touches, production included, with PUBLICLY
-- KNOWN credentials: owner PIN 3333, seller PIN 4444, owner logins
-- `<vertical>@cash-demo.shop` with the password `cash3333`. The accounts see
-- only their own store. To drop one, delete its transactional tables first in
-- the order `dropTestStore` uses (`src/__tests__/helpers/pos-fixtures.ts`),
-- then the store row — and leave its `pos_demo_seed` row, or the next boot
-- builds it again.
--
-- ONE-TIME, unlike the other demos. Each store is a COPY of its demo's
-- catalogue taken at the boot that first runs this file, and is then left
-- alone for good: the stamp in `pos_demo_seed` (slug `cash-demo-*`) means
-- "created once", so there is no `v_version` and no rebuild. A reseller's
-- edits must survive every restart, and a store deleted on purpose must stay
-- deleted. Changing the demos later does not reach these stores.
--
-- What is copied, from the source store as its own migration left it:
--   - the store's settings (vertical, modules, `module_remotes` as they are
--     at that moment — the bundle URLs stay a deployment choice made by the
--     super admin, so this file names none — menu appearance, the florist's
--     assembly charge, the guest menu's switches and the place's profile);
--   - tags, products, variants, recipes, modifiers, halls and tables — only
--     rows the demo's migration wrote (`created_at` no later than its stamp)
--     and still active, so whatever a visitor added to a public demo with its
--     known password stays behind;
--   - stock as the demo's migration left it: the sum of the movements up to
--     that stamp, not today's figure, so a demo someone has been selling from
--     still yields a full shelf. It arrives as one `seed` movement per variant.
-- Not copied: sales, refunds, documents, customers, bills, fiscal settings,
-- the GTIN key, the TikTok link. The guest menu gets its own token
-- (`cash-demo-cafe-menu`, `cash-demo-restaurant-menu`), and the print secret
-- and the tables' QR keys are filled lazily, as for any store.
--
-- Each store is built in its own sub-block: if one cannot be (a later schema
-- change, a slug taken by hand), its part rolls back with a WARNING, it is not
-- stamped and the next boot tries again — demo data must never keep the API
-- from starting. `src/__tests__/pos.cash-demo.test.ts` checks that all four
-- are built, so a silent warning still fails CI.

DO $$
DECLARE
  -- bcrypt(10) of 3333, 4444 and `cash3333`, as `src/pos/core/crypto.ts` makes them.
  c_owner_pin  CONSTANT text := '$2b$10$.C59X3/jzELRAk.MLQ9GfuhtUtkG7aC/Fnd0KchzgL95pN.nK7EAC';
  c_seller_pin CONSTANT text := '$2b$10$N0MJP0iXPYnPRFTV.IWkAuVw1Newemu/QzduPqxBwS5c6TilIPabi';
  c_password   CONSTANT text := '$2b$10$0/NRkCvVOGlhxdb9QEFKiucy3Xvm1luKKePo/YYTqhlJe.sEdhN9u';
  m        record;
  v_src    bigint;
  v_seeded timestamptz;
  v_dst    bigint;
  v_owner  bigint;
BEGIN
  IF (SELECT count(*) FROM pos_demo_seed WHERE slug LIKE 'cash-demo-%') >= 4 THEN
    RETURN;
  END IF;

  -- Old id → new id, per kind. Ids come from global sequences, so one map
  -- serves all four stores — which is why every read of it below is also
  -- scoped to the source store: the map still holds the earlier stores' rows.
  CREATE TEMP TABLE IF NOT EXISTS cash_demo_map (
    kind   text   NOT NULL,
    old_id bigint NOT NULL,
    new_id bigint NOT NULL,
    PRIMARY KEY (kind, old_id)
  ) ON COMMIT DROP;

  FOR m IN
    SELECT * FROM (VALUES
      ('demo-clothing',   'cash-demo-clothing',   'Cash Demo · Одяг',     'clothing@cash-demo.shop',   'Власниця', 'Продавчиня Оля',   NULL),
      ('demo-flowers',    'cash-demo-flowers',    'Cash Demo · Квіти',    'flowers@cash-demo.shop',    'Власниця', 'Флористка Ніна',   NULL),
      ('demo-cafe',       'cash-demo-cafe',       'Cash Demo · Кафе',     'cafe@cash-demo.shop',       'Власник',  'Бариста Марта',    'cash-demo-cafe-menu'),
      ('demo-restaurant', 'cash-demo-restaurant', 'Cash Demo · Ресторан', 'restaurant@cash-demo.shop', 'Власник',  'Офіціантка Олена', 'cash-demo-restaurant-menu')
    ) AS t(src, dst, name, login, owner_name, seller_name, menu_token)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM pos_demo_seed WHERE slug = m.dst);

    -- Someone made a store by this name by hand: it is theirs, not ours.
    IF EXISTS (SELECT 1 FROM pos_stores WHERE slug = m.dst) THEN
      RAISE WARNING '% already exists — left as it is', m.dst;
      INSERT INTO pos_demo_seed (slug, version) VALUES (m.dst, 1);
      CONTINUE;
    END IF;

    SELECT s.id, d.applied_at INTO v_src, v_seeded
      FROM pos_stores s LEFT JOIN pos_demo_seed d ON d.slug = s.slug
     WHERE s.slug = m.src;
    IF v_src IS NULL THEN
      RAISE WARNING '% not built: its source % does not exist', m.dst, m.src;
      CONTINUE;
    END IF;
    -- A demo without a stamp predates 039's bookkeeping: take what it has.
    v_seeded := COALESCE(v_seeded, 'infinity');

    BEGIN
      -- ── The store ──────────────────────────────────────────────────────
      INSERT INTO pos_stores (
        name, slug, currency, timezone, vertical, gtin_lookup_enabled, auto_print_receipt,
        enabled_modules, module_remotes, nav_overrides, florist_labour_bps,
        public_menu_enabled, public_menu_token, public_menu_bill, public_menu_ordering,
        public_menu_call, public_menu_auto_kitchen, public_menu_auto_limit_cents,
        public_logo_url, public_address, public_phone, public_hours
      )
      SELECT m.name, m.dst, s.currency, s.timezone, s.vertical, s.gtin_lookup_enabled, s.auto_print_receipt,
             s.enabled_modules, s.module_remotes, s.nav_overrides, s.florist_labour_bps,
             s.public_menu_enabled AND m.menu_token IS NOT NULL, m.menu_token,
             s.public_menu_bill, s.public_menu_ordering,
             s.public_menu_call, s.public_menu_auto_kitchen, s.public_menu_auto_limit_cents,
             s.public_logo_url, s.public_address, s.public_phone, s.public_hours
        FROM pos_stores s WHERE s.id = v_src
      RETURNING id INTO v_dst;

      INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
      VALUES (v_dst, 'owner', m.owner_name, m.login, c_password, c_owner_pin)
      RETURNING id INTO v_owner;
      INSERT INTO pos_staff (store_id, role, display_name, pin_hash)
      VALUES (v_dst, 'seller', m.seller_name, c_seller_pin);

      -- A guest order that skips the waiter needs the owner's acknowledgement
      -- on record (068); this owner inherits the demo's choice.
      UPDATE pos_stores
         SET public_menu_auto_ack_at = NOW(), public_menu_auto_ack_by = v_owner
       WHERE id = v_dst AND public_menu_auto_kitchen <> 'off';

      -- ── Tags ───────────────────────────────────────────────────────────
      INSERT INTO cash_demo_map (kind, old_id, new_id)
      SELECT 'tag', id, nextval('pos_tags_id_seq')
        FROM pos_tags WHERE store_id = v_src AND created_at <= v_seeded;
      INSERT INTO pos_tags (id, store_id, parent_id, name, sort_order, color, show_in_catalog_bar, station, created_at)
      SELECT mt.new_id, v_dst, mp.new_id, t.name, t.sort_order, t.color, t.show_in_catalog_bar, t.station, NOW()
        FROM pos_tags t
        JOIN cash_demo_map mt ON mt.kind = 'tag' AND mt.old_id = t.id
        LEFT JOIN cash_demo_map mp ON mp.kind = 'tag' AND mp.old_id = t.parent_id
       WHERE t.store_id = v_src;

      -- ── Products and variants ──────────────────────────────────────────
      INSERT INTO cash_demo_map (kind, old_id, new_id)
      SELECT 'product', id, nextval('pos_products_id_seq')
        FROM pos_products
       WHERE store_id = v_src AND is_active AND NOT one_off AND NOT needs_review
         AND created_at <= v_seeded;
      INSERT INTO pos_products (
        id, store_id, name, description, image_url, is_active, fiscal_tax_code, fiscal_uktzed,
        kind, stock_mode, sellable, composition, allergens
      )
      SELECT mp.new_id, v_dst, p.name, p.description, p.image_url, TRUE, p.fiscal_tax_code, p.fiscal_uktzed,
             p.kind, p.stock_mode, p.sellable, p.composition, p.allergens
        FROM pos_products p
        JOIN cash_demo_map mp ON mp.kind = 'product' AND mp.old_id = p.id
       WHERE p.store_id = v_src;

      INSERT INTO cash_demo_map (kind, old_id, new_id)
      SELECT 'variant', v.id, nextval('pos_variants_id_seq')
        FROM pos_variants v
        JOIN cash_demo_map mp ON mp.kind = 'product' AND mp.old_id = v.product_id
       WHERE v.store_id = v_src AND v.is_active AND v.created_at <= v_seeded;
      INSERT INTO pos_variants (
        id, store_id, product_id, sku, barcode, price_cents, cost_cents, compare_at_cents,
        attributes, label, unit, pack_qty, pack_label
      )
      SELECT mv.new_id, v_dst, mp.new_id, v.sku, v.barcode, v.price_cents, v.cost_cents, v.compare_at_cents,
             v.attributes, v.label, v.unit, v.pack_qty, v.pack_label
        FROM pos_variants v
        JOIN cash_demo_map mv ON mv.kind = 'variant' AND mv.old_id = v.id
        JOIN cash_demo_map mp ON mp.kind = 'product' AND mp.old_id = v.product_id
       WHERE v.store_id = v_src;

      INSERT INTO pos_product_tags (product_id, tag_id)
      SELECT mp.new_id, mt.new_id
        FROM pos_product_tags pt
        JOIN pos_products p ON p.id = pt.product_id AND p.store_id = v_src
        JOIN cash_demo_map mp ON mp.kind = 'product' AND mp.old_id = pt.product_id
        JOIN cash_demo_map mt ON mt.kind = 'tag' AND mt.old_id = pt.tag_id;

      -- ── Stock as the demo's migration left it ──────────────────────────
      INSERT INTO pos_stock (variant_id, store_id, quantity)
      SELECT mv.new_id, v_dst, GREATEST(COALESCE(q.qty, 0), 0)
        FROM cash_demo_map mv
        JOIN pos_variants v ON v.id = mv.old_id AND v.store_id = v_src
        LEFT JOIN LATERAL (
          SELECT SUM(delta) AS qty FROM pos_stock_movements
           WHERE variant_id = mv.old_id AND created_at <= v_seeded
        ) q ON TRUE
       WHERE mv.kind = 'variant';
      INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
      SELECT v_dst, variant_id, quantity, 'seed', 'Initial stock'
        FROM pos_stock WHERE store_id = v_dst AND quantity > 0;

      -- ── Recipes ────────────────────────────────────────────────────────
      INSERT INTO pos_product_components (store_id, variant_id, component_variant_id, quantity, sort_order)
      SELECT v_dst, mv.new_id, mc.new_id, pc.quantity, pc.sort_order
        FROM pos_product_components pc
        JOIN cash_demo_map mv ON mv.kind = 'variant' AND mv.old_id = pc.variant_id
        JOIN cash_demo_map mc ON mc.kind = 'variant' AND mc.old_id = pc.component_variant_id
       WHERE pc.store_id = v_src;

      -- 045 already ran this boot, before this store existed. Same SQL as
      -- `recomputeFlat` (and 048), for this store only.
      INSERT INTO pos_product_components_flat (store_id, variant_id, leaf_variant_id, quantity_per_unit)
      WITH RECURSIVE walk AS (
        SELECT pc.store_id, pc.variant_id AS root_id, pc.component_variant_id AS node_id,
               pc.quantity::bigint AS qty, 1 AS depth
        FROM pos_product_components pc
        WHERE pc.store_id = v_dst
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

      -- ── Modifiers ──────────────────────────────────────────────────────
      INSERT INTO cash_demo_map (kind, old_id, new_id)
      SELECT 'modifier_group', id, nextval('pos_modifier_groups_id_seq')
        FROM pos_modifier_groups
       WHERE store_id = v_src AND is_active AND created_at <= v_seeded;
      INSERT INTO pos_modifier_groups (id, store_id, name, min_select, max_select, sort_order)
      SELECT mg.new_id, v_dst, g.name, g.min_select, g.max_select, g.sort_order
        FROM pos_modifier_groups g
        JOIN cash_demo_map mg ON mg.kind = 'modifier_group' AND mg.old_id = g.id
       WHERE g.store_id = v_src;

      -- An answer whose write-off did not make it across keeps its price and
      -- writes nothing off rather than vanishing from the question.
      INSERT INTO pos_modifiers (
        store_id, group_id, name, price_delta_cents, component_variant_id, component_quantity,
        is_default, sort_order, label_deltas
      )
      SELECT v_dst, mg.new_id, x.name, x.price_delta_cents, mc.new_id,
             CASE WHEN mc.new_id IS NULL THEN NULL ELSE x.component_quantity END,
             x.is_default, x.sort_order, x.label_deltas
        FROM pos_modifiers x
        JOIN cash_demo_map mg ON mg.kind = 'modifier_group' AND mg.old_id = x.group_id
        LEFT JOIN cash_demo_map mc ON mc.kind = 'variant' AND mc.old_id = x.component_variant_id
       WHERE x.store_id = v_src AND x.is_active AND x.created_at <= v_seeded;

      INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order)
      SELECT v_dst, mp.new_id, mg.new_id, pmg.sort_order
        FROM pos_product_modifier_groups pmg
        JOIN cash_demo_map mp ON mp.kind = 'product' AND mp.old_id = pmg.product_id
        JOIN cash_demo_map mg ON mg.kind = 'modifier_group' AND mg.old_id = pmg.group_id
       WHERE pmg.store_id = v_src;

      -- ── Halls and tables (the restaurant) ──────────────────────────────
      INSERT INTO cash_demo_map (kind, old_id, new_id)
      SELECT 'hall', id, nextval('pos_halls_id_seq')
        FROM pos_halls WHERE store_id = v_src AND is_active AND created_at <= v_seeded;
      INSERT INTO pos_halls (id, store_id, name, sort_order)
      SELECT mh.new_id, v_dst, h.name, h.sort_order
        FROM pos_halls h
        JOIN cash_demo_map mh ON mh.kind = 'hall' AND mh.old_id = h.id
       WHERE h.store_id = v_src;
      INSERT INTO pos_tables (store_id, hall_id, name, seats, pos_x, pos_y, width, height, shape)
      SELECT v_dst, mh.new_id, t.name, t.seats, t.pos_x, t.pos_y, t.width, t.height, t.shape
        FROM pos_tables t
        JOIN cash_demo_map mh ON mh.kind = 'hall' AND mh.old_id = t.hall_id
       WHERE t.store_id = v_src AND t.is_active AND t.created_at <= v_seeded;

      INSERT INTO pos_demo_seed (slug, version) VALUES (m.dst, 1);
      RAISE NOTICE '% built from % (store %)', m.dst, m.src, v_dst;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '% not built, will retry on the next boot: % (%)', m.dst, SQLERRM, SQLSTATE;
    END;
  END LOOP;
END $$;
