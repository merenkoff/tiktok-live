// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/demo-suncity/gen-migration.mjs — writes
// migrations/067_pos_demo_suncity.sql from menu.json (fetch.mjs) and
// techcards.mjs. 264 dishes are too many to keep by hand in SQL, and a typo in
// a price there would be a lie told to the shop the demo is for.
//
//   node scripts/demo-suncity/gen-migration.mjs           # write the file
//   node scripts/demo-suncity/gen-migration.mjs --check   # fail if it is stale
//
// Editing the data means bumping VERSION below, exactly like `v_version` in
// 048: the stamp is how a database that already carries the demo learns that
// its catalogue must be rebuilt. TechDocs/POS_DEMO_SUNCITY.md has the design.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingredients, recipes, semis } from './techcards.mjs';

/** Bump when the generated catalogue changes (see the header of the SQL). */
const VERSION = 1;
const SLUG = 'demo-suncity';
/** Portions on the shelf for a plain dish, so the till sells and the kitchen board fills. */
const OPENING_STOCK = 50;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'migrations/067_pos_demo_suncity.sql');
const menu = JSON.parse(readFileSync(path.join(HERE, 'menu.json'), 'utf8'));

// ── SQL literals ────────────────────────────────────────────────────

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function values(rows, indent = '      ') {
  return rows.map((row) => `${indent}(${row.map(q).join(', ')})`).join(',\n');
}

// ── the catalogue, as rows ──────────────────────────────────────────

/** Colours from the tag palette (`TAG_COLOR_KEYS`), by what the category sells. */
const TAG_COLOR = {
  'Суші пончик': 'rose',
  'Українські роли': 'green',
  Роли: 'rose',
  Сети: 'purple',
  Піцца: 'orange',
  Меню: 'blue',
  ВОК: 'amber',
  Гриль: 'orange',
  Бургери: 'amber',
  Шаурма: 'amber',
  'Хот-Дог': 'amber',
  Темпура: 'rose',
  'Фаст-Фуд': 'teal',
  'Пропозиція тижня': 'green',
  Салати: 'green',
};

const label = (size) => size ?? '';
const withRecipe = (product) => Object.prototype.hasOwnProperty.call(recipes, product.name);

// An ingredient named like a dish would be found by every name lookup below
// twice («Пепероні» the sausage and «Пепероні» the pizza).
const dishNames = new Set(menu.products.map((p) => p.name.toLowerCase()));
for (const part of [...ingredients, ...semis]) {
  if (dishNames.has(part.name.toLowerCase())) {
    throw new Error(`techcards: інгредієнт «${part.name}» називається як страва`);
  }
}

for (const name of Object.keys(recipes)) {
  const product = menu.products.find((p) => p.name === name);
  if (!product) throw new Error(`techcards: «${name}» немає в menu.json`);
  for (const variant of product.variants) {
    if (!recipes[name][label(variant.size)]) {
      throw new Error(`techcards: «${name}» без рецепта для «${label(variant.size)}»`);
    }
  }
}

const tagRows = menu.categories.map((name, i) => [name, (i + 1) * 10, TAG_COLOR[name] ?? 'slate']);
const productRows = menu.products.map((p) => [
  p.name,
  p.image ? `/demo-suncity/${p.image}` : null,
  p.weight_g ? `${p.weight_g} г` : null,
  p.composition || null,
  withRecipe(p) ? 'composite' : 'simple',
  withRecipe(p) ? 'derived' : 'own',
]);
const productTagRows = menu.products.flatMap((p) => p.categories.map((c) => [p.name, c]));
const variantRows = menu.products.flatMap((p) =>
  p.variants.map((v) => [p.name, v.size ?? null, v.price_cents, withRecipe(p) ? 0 : OPENING_STOCK])
);

const ingredientRows = ingredients.map((i) => [i.name, i.unit, i.cost, i.qty]);
const semiRows = semis.map((s) => [s.name, s.unit ?? 'шт']);
const recipeRows = [
  ...semis.flatMap((s) => s.parts.map(([part, qty], ord) => [s.name, '', part, qty, ord])),
  ...Object.entries(recipes).flatMap(([dish, bySize]) =>
    Object.entries(bySize).flatMap(([size, parts]) => parts.map(([part, qty], ord) => [dish, size, part, qty, ord]))
  ),
];

const groupRows = menu.modifier_groups.map((g, i) => [g.name, g.min_select, g.max_select, (i + 1) * 10]);
const answerRows = menu.modifier_groups.flatMap((g) =>
  g.answers.map((a, ord) => [g.name, a.name, a.price_delta_cents, JSON.stringify(a.label_deltas), ord])
);
const linkRows = menu.products.flatMap((p) =>
  (p.modifier_groups ?? []).map((key, ord) => [p.name, menu.modifier_groups.find((g) => g.key === key).name, ord])
);

const hours = JSON.stringify(
  Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((d) => [d, menu.store.hours]))
);

// ── the file ────────────────────────────────────────────────────────

const sql = `-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 067_pos_demo_suncity.sql — GENERATED by scripts/demo-suncity/gen-migration.mjs
-- from scripts/demo-suncity/menu.json and techcards.mjs. Edit those and re-run
-- the generator; \`pos.demo-suncity.test.ts\` runs it with --check and fails on
-- a stale file. TechDocs/POS_DEMO_SUNCITY.md is the design and resume point.
--
-- «Sun City» (Малин) — sushi, pizza and fast food for delivery, a café without
-- tables: the real menu of ${menu.source.site} as of ${menu.source.fetched_on}
-- (${menu.products.length} dishes in ${menu.categories.length} categories, the site's own photos under
-- public/demo-suncity/). A pizza is one card in two sizes, and its crust costs
-- more on the bigger one — the answer's \`label_deltas\` (migration 066).
--
-- ⚠ READ BEFORE DEPLOYING. Like 039/048/053, this inserts DEMO DATA into every
-- database the runner touches — production included — with PUBLICLY KNOWN
-- credentials (owner@suncity.shop / owner123, owner PIN 0000, seller PIN
-- 1234). Those accounts see only their own store. Dropping it takes the
-- ordered delete of 048's header, with the bill tables first as in 053.
--
-- Idempotency is the 039 stamp (\`pos_demo_seed\`, compared with \`v_version\`):
-- no store → build; stamp = v_version → return; older or absent → rebuild the
-- catalogue (its sales, documents and carts go with it) keeping the store row,
-- its configuration and staff. The generator's VERSION is \`v_version\`.
-- Never written here: \`module_remotes\` (a deployment choice the super admin
-- makes) and anything the owner may have set on the store row since — the
-- public-menu token and the profile are filled only while still empty.

DO $$
DECLARE
  -- Bump in the generator when the catalogue changes. The header says what that does.
  v_version CONSTANT int := ${VERSION};
  v_stamped  int;
  v_store    bigint;
  v_owner    bigint;
  v_prod     bigint;
  v_variant  bigint;
  v_part     bigint;
  v_group    bigint;
  v_rows     int;
  r          record;
  c          record;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = '${SLUG}';
  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = '${SLUG}';

  IF v_store IS NOT NULL AND v_stamped = v_version THEN
    RAISE NOTICE '${SLUG} already at version % — skipping', v_version;
    RETURN;
  END IF;

  IF v_store IS NOT NULL THEN
    RAISE NOTICE '${SLUG} at version % — rebuilding its catalogue at %',
      COALESCE(v_stamped::text, 'none'), v_version;

    -- Content only; the store row and its configuration stay. 053's order:
    -- the bill tables first (a store without the \`tables\` module has none,
    -- but a visitor with the demo's credentials could have opened one).
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

    SELECT id INTO v_owner
      FROM pos_staff
     WHERE store_id = v_store AND role = 'owner' AND is_active
     ORDER BY id LIMIT 1;
  ELSE
    INSERT INTO pos_stores (name, slug, currency, timezone, vertical)
    VALUES (${q(menu.store.name)}, '${SLUG}', 'UAH', 'Europe/Kyiv', 'cafe')
    RETURNING id INTO v_store;
  END IF;

  -- The bcrypt(10) digests 039 introduced (owner123 / 0000 / 1234). Only when
  -- the store has nobody: a rebuild never rewrites anyone's credentials.
  IF v_owner IS NULL THEN
    INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
    VALUES (
      v_store, 'owner', 'Власник', 'owner@suncity.shop',
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
      v_store, 'seller', 'Касир',
      '$2b$10$4vDSYZFiSOgarz.z0sihVeqbYlAtUG0ZfI1uNFbWDGhzi4jKVaG1q'
    );
  END IF;

  -- ── Categories ──────────────────────────────────────────────────────────
  -- The site's own, in its order, each a tab on the till's bar. All cooked
  -- in one kitchen, so every one routes the ticket there.
  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar, station)
  SELECT v_store, t.name, t.ord, t.color, TRUE, 'kitchen'
  FROM (VALUES
${values(tagRows)}
  ) AS t(name, ord, color);
${
  ingredientRows.length
    ? `  INSERT INTO pos_tags (store_id, name, sort_order, color, show_in_catalog_bar, station)
  VALUES (v_store, 'Інгредієнти', ${(tagRows.length + 1) * 10}, 'slate', FALSE, NULL);
`
    : ''
}
  -- ── Dishes ──────────────────────────────────────────────────────────────
  -- The description is the weight the site gives; the composition is the
  -- site's text, verbatim. Allergens stay empty: empty means «not said», and
  -- nobody here may say it for a real kitchen. A dish with a tech card is a
  -- \`derived\` recipe; every other one has its own shelf.
  FOR r IN
    SELECT * FROM (VALUES
${values(productRows)}
    ) AS t(name, image, description, composition, kind, mode)
  LOOP
    INSERT INTO pos_products (store_id, name, image_url, description, composition, kind, stock_mode, sellable)
    VALUES (v_store, r.name, r.image, r.description, r.composition, r.kind, r.mode, TRUE);
  END LOOP;

  INSERT INTO pos_product_tags (product_id, tag_id)
  SELECT p.id, t.id
  FROM (VALUES
${values(productTagRows)}
  ) AS x(product, tag)
  JOIN pos_products p ON p.store_id = v_store AND p.name = x.product
  JOIN pos_tags t ON t.store_id = v_store AND t.name = x.tag;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> ${productTagRows.length} THEN
    RAISE EXCEPTION '${SLUG}: % of ${productTagRows.length} dish categories matched', v_rows;
  END IF;

  -- One row per size. The caption is the café rule (\`cafe.ts\` labelOf: the
  -- size, or nothing), written out because SQL cannot call it;
  -- \`pos.demo-suncity.test.ts\` re-derives every one. Cost 0 is «not known».
  FOR r IN
    SELECT * FROM (VALUES
${values(variantRows)}
    ) AS t(product, size, price, qty)
  LOOP
    SELECT id INTO v_prod FROM pos_products WHERE store_id = v_store AND name = r.product;
    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (
      v_store, v_prod,
      CASE WHEN r.size IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('size', r.size) END,
      COALESCE(r.size, ''),
      'шт', r.price, 0
    )
    RETURNING id INTO v_variant;
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, r.qty);
    IF r.qty > 0 THEN
      INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
      VALUES (v_store, v_variant, r.qty, 'seed', 'Initial stock');
    END IF;
  END LOOP;
${
  ingredientRows.length
    ? `
  -- ── Ingredients (tech cards) ────────────────────────────────────────────
  -- Never on the menu (044), counted in the base unit, cost per that unit.
  FOR r IN
    SELECT * FROM (VALUES
${values(ingredientRows)}
    ) AS t(name, unit, cost, qty)
  LOOP
    INSERT INTO pos_products (store_id, name, kind, stock_mode, sellable)
    VALUES (v_store, r.name, 'simple', 'own', FALSE)
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
`
    : ''
}${
  semiRows.length
    ? `
  -- Semi-finished, \`derived\`: folded into every dish that names it.
  FOR r IN
    SELECT * FROM (VALUES
${values(semiRows)}
    ) AS t(name, unit)
  LOOP
    INSERT INTO pos_products (store_id, name, kind, stock_mode, sellable)
    VALUES (v_store, r.name, 'composite', 'derived', FALSE)
    RETURNING id INTO v_prod;
    INSERT INTO pos_product_tags (product_id, tag_id)
    SELECT v_prod, id FROM pos_tags WHERE store_id = v_store AND name = 'Інгредієнти';
    INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents, cost_cents)
    VALUES (v_store, v_prod, '{}'::jsonb, '', r.unit, 0, 0)
    RETURNING id INTO v_variant;
    INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, v_store, 0);
  END LOOP;
`
    : ''
}${
  recipeRows.length
    ? `
  -- Per one unit of the dish, in the part's own unit; a pizza has a recipe per
  -- size. Looked up by name and caption, so a drift fails here by name.
  FOR c IN
    SELECT * FROM (VALUES
${values(recipeRows)}
    ) AS t(dish, dish_label, part, qty, ord)
  LOOP
    SELECT v.id INTO v_variant
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.dish AND v.label = c.dish_label;
    IF v_variant IS NULL THEN
      RAISE EXCEPTION '${SLUG}: no dish % / "%"', c.dish, c.dish_label;
    END IF;
    SELECT v.id INTO v_part
      FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = v_store AND p.name = c.part AND NOT p.sellable;
    IF v_part IS NULL THEN
      RAISE EXCEPTION '${SLUG}: no ingredient % for dish %', c.part, c.dish;
    END IF;
    INSERT INTO pos_product_components (store_id, variant_id, component_variant_id, quantity, sort_order)
    VALUES (v_store, v_variant, v_part, c.qty, c.ord);
  END LOOP;
`
    : ''
}
  -- ── Pizza questions ─────────────────────────────────────────────────────
  -- One crust and one sauce, both optional, as on the site. The crust costs
  -- more on the 50 см pizza: \`label_deltas\` (066) holds that size's price.
  FOR r IN
    SELECT * FROM (VALUES
${values(groupRows)}
    ) AS t(name, min_sel, max_sel, ord)
  LOOP
    INSERT INTO pos_modifier_groups (store_id, name, min_select, max_select, sort_order)
    VALUES (v_store, r.name, r.min_sel, r.max_sel, r.ord);
  END LOOP;

  FOR c IN
    SELECT * FROM (VALUES
${values(answerRows)}
    ) AS t(grp, answer, delta, label_deltas, ord)
  LOOP
    SELECT id INTO v_group FROM pos_modifier_groups WHERE store_id = v_store AND name = c.grp;
    INSERT INTO pos_modifiers (store_id, group_id, name, price_delta_cents, label_deltas, sort_order)
    VALUES (v_store, v_group, c.answer, c.delta, c.label_deltas::jsonb, c.ord);
  END LOOP;

  INSERT INTO pos_product_modifier_groups (store_id, product_id, group_id, sort_order)
  SELECT v_store, p.id, g.id, x.ord
  FROM (VALUES
${values(linkRows)}
  ) AS x(product, grp, ord)
  JOIN pos_products p ON p.store_id = v_store AND p.name = x.product AND p.sellable
  JOIN pos_modifier_groups g ON g.store_id = v_store AND g.name = x.grp;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> ${linkRows.length} THEN
    RAISE EXCEPTION '${SLUG}: % of ${linkRows.length} pizza questions attached', v_rows;
  END IF;

  -- ── The expanded recipes ────────────────────────────────────────────────
  -- 045 already ran this boot, before this store existed: \`recomputeFlat\`'s
  -- SQL for this store only (048 does the same).
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

  -- ── The guest's menu ────────────────────────────────────────────────────
  -- Published at /m/${SLUG}-menu with the place's own header. Only while
  -- empty, like 056/059: whatever the owner (or a visitor with the demo's
  -- credentials) set afterwards stays. No guest ordering — there are no tables.
  UPDATE pos_stores
     SET public_menu_token = '${SLUG}-menu', public_menu_enabled = TRUE
   WHERE id = v_store AND public_menu_token IS NULL;

  UPDATE pos_stores
     SET public_logo_url = '/demo-suncity/${menu.store.logo}',
         public_address = ${q(menu.store.address)},
         public_phone = ${q(menu.store.phone)},
         public_hours = '${hours}'::jsonb
   WHERE id = v_store
     AND public_logo_url IS NULL AND public_address IS NULL
     AND public_phone IS NULL AND public_hours IS NULL;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('${SLUG}', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE '${SLUG} store ready at version % (id %)', v_version, v_store;
END $$;
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // missing counts as stale
  }
  if (current !== sql) {
    console.error(`${path.relative(ROOT, OUT)} is stale — run node scripts/demo-suncity/gen-migration.mjs`);
    process.exit(1);
  }
  console.log(`${path.relative(ROOT, OUT)} is up to date`);
} else {
  writeFileSync(OUT, sql);
  console.log(
    `${path.relative(ROOT, OUT)}: ${productRows.length} dishes, ${variantRows.length} variants, ` +
      `${recipeRows.length} recipe lines, version ${VERSION}`
  );
}
