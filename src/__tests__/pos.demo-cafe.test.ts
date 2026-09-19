// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { readMigration } from '../pos/migrations.js';
import { cafeVertical } from '../pos/verticals/cafe.js';
import { normalizeVariant } from '../pos/verticals/attributes.js';
import { verifyPassword, verifyPin } from '../pos/core/crypto.js';
import { getCatalog } from '../pos/products.service.js';

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public'
);

const MIGRATION = '048_pos_demo_cafe_store.sql';

/**
 * Migration `048` ships the «Demo Café» store as data, with the risks 039 has
 * (hand-written SQL drifting from the code, hand-written stock that stops
 * adding up) plus two of its own: it writes modifier groups, and it has to
 * rebuild the expanded recipes itself because 045 ran before it. All pinned
 * here.
 */
describe.skipIf(!hasDb)('demo café store (migration 048)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-cafe'`);
    expect(store.rows.length, 'migration 048 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 60000);

  afterAll(async () => {
    await pool.end();
  });

  const variantByName = async (name: string, label = '') => {
    const row = await pool.query(
      `SELECT v.id FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND p.name = $2 AND v.label = $3`,
      [storeId, name, label]
    );
    expect(row.rows.length, `${name} / "${label}"`).toBe(1);
    return Number(row.rows[0].id);
  };

  it('is on the café vertical', async () => {
    const row = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
    expect(row.rows[0].vertical).toBe('cafe');
  });

  it('writes every caption the café rule would have derived', async () => {
    const rows = await pool.query(
      `SELECT v.id, v.attributes, v.label, v.unit, p.name
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 ORDER BY v.id`,
      [storeId]
    );
    expect(rows.rows.length).toBe(47);
    for (const row of rows.rows) {
      const derived = normalizeVariant(cafeVertical, {
        attributes: row.attributes,
        unit: row.unit,
      });
      expect(derived.label, `${row.name} (variant ${row.id})`).toBe(row.label);
      expect(derived.attributes).toEqual(row.attributes);
    }
  });

  it('carries the menu, the ingredients off the menu, and the two kinds of recipe', async () => {
    const counts = await pool.query(
      `SELECT p.kind, p.stock_mode, p.sellable, COUNT(*)::int AS n
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
      [storeId]
    );
    const by = Object.fromEntries(
      counts.rows.map((r) => [`${r.kind}/${r.stock_mode}/${r.sellable ? 'menu' : 'shelf'}`, Number(r.n)])
    );
    // 13 ingredients + 3 cup sizes; croissant, cheesecake, syrnyk, two waters.
    expect(by['simple/own/shelf']).toBe(16);
    expect(by['simple/own/menu']).toBe(5);
    // 23 drink sizes on the menu, one syrup portion off it.
    expect(by['composite/derived/menu']).toBe(23);
    expect(by['composite/derived/shelf']).toBe(1);
    // The sandwich, and the sauce it is made with.
    expect(by['composite/own/menu']).toBe(1);
    expect(by['composite/own/shelf']).toBe(1);
  });

  it('has a picture on every product, and the file is in the repo', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-cafe\/[a-z0-9-]+\.svg$/);
      expect(
        fs.existsSync(path.join(PUBLIC_DIR, row.image_url)),
        `${row.name} → ${row.image_url} missing`
      ).toBe(true);
    }
  });

  it('balances: every stock row equals the sum of its movements', async () => {
    const drift = await pool.query(
      `SELECT v.id, p.name, s.quantity, COALESCE(SUM(m.delta), 0)::int AS moved
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       JOIN pos_stock s ON s.variant_id = v.id
       LEFT JOIN pos_stock_movements m ON m.variant_id = v.id
       WHERE v.store_id = $1
       GROUP BY v.id, p.name, s.quantity
       HAVING s.quantity <> COALESCE(SUM(m.delta), 0)`,
      [storeId]
    );
    expect(drift.rows).toEqual([]);
  });

  it('made the sauce first and then the sandwiches, each costed from what went in', async () => {
    const docs = await pool.query(
      `SELECT d.doc_number, d.status, l.quantity, l.unit_cost_cents, p.name
       FROM pos_stock_documents d
       JOIN pos_stock_document_lines l ON l.document_id = d.id
       JOIN pos_variants v ON v.id = l.variant_id
       JOIN pos_products p ON p.id = v.product_id
       WHERE d.store_id = $1 AND d.type = 'production'
       ORDER BY d.id`,
      [storeId]
    );
    expect(docs.rows.map((r) => [r.name, Number(r.quantity), Number(r.unit_cost_cents)])).toEqual([
      // 10 g butter at 25 + 15 g cheese at 30.
      ['Соус сніданковий, порція', 40, 10 * 25 + 15 * 30],
      // 2 slices at 300 + 30 g cheese at 30 + one portion of sauce at ITS cost.
      ['Сендвіч сніданковий', 12, 2 * 300 + 30 * 30 + 700],
    ]);
    expect(docs.rows.every((r) => r.status === 'posted')).toBe(true);

    // The sauce is an `own` recipe: making sandwiches took portions of it,
    // not butter and cheese again.
    const sauce = await pool.query(
      `SELECT s.quantity FROM pos_stock s WHERE s.variant_id = $1`,
      [await variantByName('Соус сніданковий, порція')]
    );
    expect(Number(sauce.rows[0].quantity)).toBe(40 - 12);
  });

  it('leaves the document counter past the numbers it used', async () => {
    const year = new Date().getFullYear();
    const used = await pool.query(
      `SELECT doc_number FROM pos_stock_documents
       WHERE store_id = $1 AND type = 'production' ORDER BY doc_number DESC LIMIT 1`,
      [storeId]
    );
    const counter = await pool.query(
      `SELECT next_value FROM pos_store_counters WHERE store_id = $1 AND counter_key = $2`,
      [storeId, `production_${year}`]
    );
    expect(String(used.rows[0].doc_number)).toBe(`ВР-${year}-00002`);
    expect(Number(counter.rows[0].next_value)).toBe(3);
  });

  it('expands the recipes itself — 045 ran before this store existed', async () => {
    // Re-apply 048 alone, from an unstamped state, and compare its flat table
    // with an independent expansion of the authored recipes: a `derived`
    // component folds in, an `own` one stays a leaf, duplicates add up.
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-cafe'`);
    await pool.query(readMigration(MIGRATION));

    const authored = await pool.query(
      `SELECT c.variant_id, c.component_variant_id AS node, c.quantity
       FROM pos_product_components c WHERE c.store_id = $1`,
      [storeId]
    );
    const kinds = await pool.query(
      `SELECT v.id, p.kind, p.stock_mode FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id WHERE v.store_id = $1`,
      [storeId]
    );
    const folds = new Set(
      kinds.rows
        .filter((r) => r.kind === 'composite' && r.stock_mode === 'derived')
        .map((r) => Number(r.id))
    );
    const byRoot = new Map<number, Array<{ node: number; qty: number }>>();
    for (const row of authored.rows) {
      const root = Number(row.variant_id);
      byRoot.set(root, [...(byRoot.get(root) ?? []), { node: Number(row.node), qty: Number(row.quantity) }]);
    }
    const expected: Array<[number, number, number]> = [];
    for (const root of byRoot.keys()) {
      const leaves = new Map<number, number>();
      const walk = (id: number, mult: number) => {
        for (const part of byRoot.get(id) ?? []) {
          if (folds.has(part.node)) walk(part.node, mult * part.qty);
          else leaves.set(part.node, (leaves.get(part.node) ?? 0) + mult * part.qty);
        }
      };
      walk(root, 1);
      for (const [leaf, qty] of leaves) expected.push([root, leaf, qty]);
    }
    expected.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const flat = await pool.query(
      `SELECT variant_id, leaf_variant_id, quantity_per_unit
       FROM pos_product_components_flat WHERE store_id = $1
       ORDER BY variant_id, leaf_variant_id`,
      [storeId]
    );
    expect(flat.rows.map((r) => [Number(r.variant_id), Number(r.leaf_variant_id), Number(r.quantity_per_unit)])).toEqual(expected);

    // Concretely: a raf holds the syrup's sugar and water, never the syrup;
    // a sandwich holds the sauce itself, never its butter.
    const rafM = await variantByName('Раф', 'M');
    const syrup = await variantByName('Сироп карамельний, порція');
    const sugar = await variantByName('Цукор');
    const rafLeaves = new Map(
      flat.rows.filter((r) => Number(r.variant_id) === rafM).map((r) => [Number(r.leaf_variant_id), Number(r.quantity_per_unit)])
    );
    expect(rafLeaves.has(syrup)).toBe(false);
    expect(rafLeaves.get(sugar)).toBe(5);

    const sandwich = await variantByName('Сендвіч сніданковий');
    const sauce = await variantByName('Соус сніданковий, порція');
    const butter = await variantByName('Масло');
    const sandwichLeaves = new Map(
      flat.rows.filter((r) => Number(r.variant_id) === sandwich).map((r) => [Number(r.leaf_variant_id), Number(r.quantity_per_unit)])
    );
    expect(sandwichLeaves.get(sauce)).toBe(1);
    expect(sandwichLeaves.has(butter)).toBe(false);
  });

  it('shows each drink at what its beans, cups and syrup allow', async () => {
    const catalog = await getCatalog(storeId, { snapshot: true, vertical: cafeVertical });
    const qty = (name: string, label = '') =>
      catalog.find((item) => item.product_name === name && item.label === label)?.quantity;
    // 5000 g of beans / 18 per shot is the binding constraint everywhere.
    expect(qty('Латте', 'M')).toBe(Math.floor(5000 / 18));
    expect(qty('Раф', 'M')).toBe(Math.floor(5000 / 18));
    // 2000 g of cocoa / 25.
    expect(qty('Какао', 'M')).toBe(80);
    // Made in advance: counted on its own row.
    expect(qty('Сендвіч сніданковий')).toBe(12);
    // On the menu, out of stock — the tile goes grey, it does not disappear.
    expect(qty('Сирник')).toBe(0);

    // Short the sugar and the syrup's constraint surfaces through the raf,
    // while a latte, which takes no sugar in its recipe, is untouched.
    const sugar = await variantByName('Цукор');
    await pool.query(`UPDATE pos_stock SET quantity = 20 WHERE variant_id = $1`, [sugar]);
    try {
      const short = await getCatalog(storeId, { snapshot: true, vertical: cafeVertical });
      const q = (name: string, label: string) =>
        short.find((item) => item.product_name === name && item.label === label)?.quantity;
      expect(q('Раф', 'M')).toBe(4);
      expect(q('Какао', 'M')).toBe(2);
      expect(q('Латте', 'M')).toBe(Math.floor(5000 / 18));
    } finally {
      await pool.query(`UPDATE pos_stock SET quantity = 5000 WHERE variant_id = $1`, [sugar]);
    }
  });

  it('keeps the ingredients off the sell screen unless the stock count asks', async () => {
    const menu = await getCatalog(storeId, { snapshot: true, vertical: cafeVertical });
    expect(menu.find((item) => item.product_name === 'Зерно арабіка')).toBeUndefined();
    expect(menu.find((item) => item.product_name === 'Сироп карамельний, порція')).toBeUndefined();
    expect(menu.every((item) => item.sellable !== false)).toBe(true);

    const everything = await getCatalog(storeId, {
      snapshot: true,
      vertical: cafeVertical,
      includeUnsellable: true,
    });
    const beans = everything.find((item) => item.product_name === 'Зерно арабіка');
    expect(beans?.sellable).toBe(false);
    expect(beans?.unit).toBe('г');
  });

  it('asks the questions in order, with a default where the question is required', async () => {
    const catalog = await getCatalog(storeId, { snapshot: true, vertical: cafeVertical });
    const latte = catalog.find((item) => item.product_name === 'Латте' && item.label === 'M');
    expect(latte?.modifier_groups?.map((g) => g.name)).toEqual([
      'Молоко',
      'Сироп',
      'Цукор',
      'Порція',
      'Температура',
    ]);
    const milk = latte!.modifier_groups![0];
    expect(milk).toMatchObject({ min_select: 1, max_select: 1 });
    expect(milk.modifiers.map((m) => [m.name, m.price_delta_cents, m.is_default])).toEqual([
      ['звичайне', 0, true],
      ['вівсяне', 1500, false],
      ['мигдальне', 1500, false],
    ]);
    // The answer takes its own milk — the recipe carries none (§4.3).
    const oat = await variantByName('Молоко вівсяне');
    expect(milk.modifiers[1]).toMatchObject({ component_variant_id: oat, component_quantity: 200 });
    expect(latte!.components!.some((c) => c.product_name.startsWith('Молоко'))).toBe(false);

    // A smaller portion is a negative delta; the caramel takes a syrup portion,
    // which is itself a recipe.
    const half = latte!.modifier_groups![3].modifiers.find((m) => m.name === 'половина');
    expect(half?.price_delta_cents).toBe(-2000);
    const caramel = latte!.modifier_groups![1].modifiers.find((m) => m.name === 'карамель');
    expect(caramel?.component_variant_id).toBe(await variantByName('Сироп карамельний, порція'));

    // Every required question a drink asks has a default — «як завжди» stays
    // one tap on the till.
    for (const item of catalog) {
      for (const group of item.modifier_groups ?? []) {
        if (group.min_select >= 1) {
          expect(group.modifiers.some((m) => m.is_default), `${item.product_name} / ${group.name}`).toBe(true);
        }
      }
    }
    // Food asks nothing.
    expect(catalog.find((item) => item.product_name === 'Круасан')?.modifier_groups).toBeUndefined();
  });

  it('carries the credentials the migration header advertises', async () => {
    const staff = await pool.query(
      `SELECT role, login, password_hash, pin_hash FROM pos_staff
       WHERE store_id = $1 ORDER BY role`,
      [storeId]
    );
    const owner = staff.rows.find((r) => r.role === 'owner')!;
    const seller = staff.rows.find((r) => r.role === 'seller')!;
    expect(owner.login).toBe('owner@cafe.shop');
    expect(await verifyPassword('owner123', owner.password_hash)).toBe(true);
    expect(await verifyPin('0000', owner.pin_hash)).toBe(true);
    expect(await verifyPin('1234', seller.pin_hash)).toBe(true);
  });

  it('ships no module remote — a dev URL must never reach production', async () => {
    const sql = readMigration(MIGRATION)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toContain('module_remotes');
    expect(sql).not.toContain('localhost');
  });

  it('is idempotent — re-running the migration changes nothing', async () => {
    const shape = async () =>
      (
        await pool.query(
          `SELECT (SELECT COUNT(*) FROM pos_stores WHERE slug = 'demo-cafe') AS stores,
                  (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
                  (SELECT COUNT(*) FROM pos_modifiers WHERE store_id = $1) AS modifiers,
                  (SELECT COUNT(*) FROM pos_stock_movements WHERE store_id = $1) AS moves,
                  (SELECT md5(string_agg(id::text, ',' ORDER BY id))
                     FROM pos_products WHERE store_id = $1) AS product_ids,
                  (SELECT version FROM pos_demo_seed WHERE slug = 'demo-cafe') AS stamp`,
          [storeId]
        )
      ).rows[0];

    const before = await shape();
    await pool.query(readMigration(MIGRATION));
    expect(await shape()).toEqual(before);
    expect(Number(before.stores)).toBe(1);
    expect(Number(before.modifiers)).toBe(12);
    expect(Number(before.stamp)).toBeGreaterThan(0);
  });

  it('rebuilds a store that predates the stamp, keeping what its owner set', async () => {
    // Same contract as 039, plus the tables 046 added: the sale-line modifier
    // snapshots go with the sale, and the modifiers themselves are replaced.
    const url = 'https://cdn.example/test@v9/vertical-cafe/remote-entry.js';
    await pool.query(
      `UPDATE pos_stores
          SET module_remotes = jsonb_build_object(
                'vertical-cafe',
                jsonb_build_object('url', $2::text, 'title', 'Кафе', 'routePath', '/cafe'))
        WHERE id = $1`,
      [storeId, url]
    );
    const staffBefore = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );
    const sale = await pool.query(
      `INSERT INTO pos_sales (store_id, staff_id, receipt_number)
       VALUES ($1, $2, 'DEMO-REBUILD-1') RETURNING id`,
      [storeId, staffBefore.rows[0].id]
    );
    const item = await pool.query(
      `INSERT INTO pos_sale_items
         (sale_id, store_id, variant_id, product_name, quantity, unit_price_cents, line_total_cents)
       VALUES ($2, $1, $3, 'before the rebuild', 1, 8000, 8000) RETURNING id`,
      [storeId, sale.rows[0].id, await variantByName('Латте', 'M')]
    );
    await pool.query(
      `INSERT INTO pos_sale_item_modifiers
         (store_id, sale_item_id, modifier_id, group_name, name, price_delta_cents, sort_order)
       SELECT $1, $2, id, 'Молоко', name, price_delta_cents, 0
         FROM pos_modifiers WHERE store_id = $1 AND name = 'вівсяне'`,
      [storeId, item.rows[0].id]
    );
    await pool.query(
      `INSERT INTO pos_products (store_id, name, kind, stock_mode)
       VALUES ($1, 'Маффін (старий сид)', 'simple', 'own')`,
      [storeId]
    );
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-cafe'`);

    await pool.query(readMigration(MIGRATION));

    const after = await pool.query(
      `SELECT (SELECT id FROM pos_stores WHERE slug = 'demo-cafe') AS store_id,
              (SELECT module_remotes -> 'vertical-cafe' ->> 'url'
                 FROM pos_stores WHERE id = $1) AS module_url,
              (SELECT COUNT(*) FROM pos_sales WHERE store_id = $1) AS sales,
              (SELECT COUNT(*) FROM pos_sale_item_modifiers WHERE store_id = $1) AS snapshots,
              (SELECT COUNT(*) FROM pos_modifiers WHERE store_id = $1) AS modifiers,
              (SELECT COUNT(*) FROM pos_products
                WHERE store_id = $1 AND name = 'Маффін (старий сид)') AS leftovers,
              (SELECT COUNT(*) FROM pos_stock_documents WHERE store_id = $1) AS docs,
              (SELECT COUNT(*) FROM pos_product_components_flat WHERE store_id = $1) AS flat,
              (SELECT version FROM pos_demo_seed WHERE slug = 'demo-cafe') AS stamp`,
      [storeId]
    );
    expect(Number(after.rows[0].store_id)).toBe(storeId);
    expect(after.rows[0].module_url).toBe(url);
    expect(Number(after.rows[0].sales)).toBe(0);
    expect(Number(after.rows[0].snapshots)).toBe(0);
    expect(Number(after.rows[0].modifiers)).toBe(12);
    expect(Number(after.rows[0].leftovers)).toBe(0);
    expect(Number(after.rows[0].docs)).toBe(2);
    expect(Number(after.rows[0].flat)).toBeGreaterThan(0);
    expect(Number(after.rows[0].stamp)).toBeGreaterThan(0);

    const staffAfter = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );
    expect(staffAfter.rows).toEqual(staffBefore.rows);

    await pool.query(`UPDATE pos_stores SET module_remotes = '{}'::jsonb WHERE id = $1`, [
      storeId,
    ]);
  });

  it('leaves an edited demo alone while the stamp matches', async () => {
    const latteM = await variantByName('Латте', 'M');
    await pool.query(`UPDATE pos_variants SET price_cents = 99999 WHERE id = $1`, [latteM]);
    await pool.query(readMigration(MIGRATION));
    const edited = await pool.query(`SELECT price_cents FROM pos_variants WHERE id = $1`, [latteM]);
    expect(Number(edited.rows[0].price_cents)).toBe(99999);
    await pool.query(`UPDATE pos_variants SET price_cents = 6500 WHERE id = $1`, [latteM]);
  });
});
