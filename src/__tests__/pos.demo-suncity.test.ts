// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.demo-suncity.test.ts — the «Sun City» demo café (migration
// 067, generated from scripts/demo-suncity/menu.json). A demo for the shop
// whose menu it copies, so the price of every pizza edition the site sells is
// checked against what the till would charge, not a sample.
// TechDocs/POS_DEMO_SUNCITY.md.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
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
import { completeSale } from '../pos/sales.service.js';
import { listTechCards } from '../pos/composites.service.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = '067_pos_demo_suncity.sql';
const SLUG = 'demo-suncity';

interface MenuJson {
  categories: string[];
  modifier_groups: Array<{ key: string; name: string; answers: Array<{ name: string }> }>;
  products: Array<{
    name: string;
    categories: string[];
    composition: string;
    weight_g: number | null;
    image: string | null;
    variants: Array<{ size: string | null; price_cents: number }>;
    modifier_groups?: string[];
    site_editions?: Array<{ size: string; crust: string | null; sauce: string | null; price_cents: number }>;
  }>;
  notes: string[];
}

const menu = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/demo-suncity/menu.json'), 'utf8')
) as MenuJson;

describe.skipIf(!hasDb)('demo «Sun City» store (migration 067)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    // A database stamped by an earlier build of an unreleased demo would keep
    // its old catalogue; rebuild so what is checked is this file.
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = $1`, [SLUG]);
    await pool.query(readMigration(MIGRATION));
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = $1`, [SLUG]);
    expect(store.rows.length, 'migration 067 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 120000);

  afterAll(async () => {
    await pool.end();
  });

  it('is the generator’s output, not a hand edit', () => {
    expect(() =>
      execFileSync('node', ['scripts/demo-suncity/gen-migration.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })
    ).not.toThrow();
  });

  it('is a café named Sun City, with no dining room', async () => {
    const row = await pool.query(
      `SELECT name, vertical, timezone,
              (SELECT COUNT(*) FROM pos_halls WHERE store_id = s.id) AS halls,
              (SELECT COUNT(*) FROM pos_tables WHERE store_id = s.id) AS tables
       FROM pos_stores s WHERE id = $1`,
      [storeId]
    );
    expect(row.rows[0]).toMatchObject({ name: 'Sun City', vertical: 'cafe', timezone: 'Europe/Kyiv' });
    expect(Number(row.rows[0].halls)).toBe(0);
    expect(Number(row.rows[0].tables)).toBe(0);
  });

  it('carries the site’s categories in its order, on the till’s bar, routed to the kitchen', async () => {
    const tags = await pool.query(
      `SELECT name, show_in_catalog_bar, station FROM pos_tags WHERE store_id = $1 ORDER BY sort_order, id`,
      [storeId]
    );
    const onBar = tags.rows.filter((t) => t.show_in_catalog_bar);
    expect(onBar.map((t) => t.name)).toEqual(menu.categories);
    expect(onBar.every((t) => t.station === 'kitchen')).toBe(true);
    // The ingredients' tag is the only other one, and it is off the bar.
    expect(tags.rows.filter((t) => !t.show_in_catalog_bar).map((t) => t.name)).toEqual(['Інгредієнти']);
  });

  it('carries every dish of the snapshot, in every category the site lists it under', async () => {
    const rows = await pool.query(
      `SELECT p.name, p.description, p.composition, p.allergens,
              array_agg(t.name ORDER BY t.sort_order) AS tags
       FROM pos_products p
       JOIN pos_product_tags pt ON pt.product_id = p.id
       JOIN pos_tags t ON t.id = pt.tag_id
       WHERE p.store_id = $1 AND p.sellable
       GROUP BY p.id`,
      [storeId]
    );
    expect(rows.rows.length).toBe(menu.products.length);
    const byName = new Map(rows.rows.map((r) => [r.name, r]));
    const order = (names: string[]) => [...names].sort((a, b) => menu.categories.indexOf(a) - menu.categories.indexOf(b));
    for (const dish of menu.products) {
      const row = byName.get(dish.name);
      expect(row, dish.name).toBeDefined();
      expect(row.tags, dish.name).toEqual(order(dish.categories));
      expect(row.description, dish.name).toBe(dish.weight_g ? `${dish.weight_g} г` : null);
      expect(row.composition, dish.name).toBe(dish.composition || null);
      // Empty means «not said» — nobody here may say it for a real kitchen.
      expect(row.allergens, dish.name).toEqual([]);
    }
  });

  it('writes every caption the café rule would have derived, at the site’s price', async () => {
    const rows = await pool.query(
      `SELECT v.attributes, v.label, v.unit, v.price_cents, p.name, p.sellable
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      const derived = normalizeVariant(cafeVertical, { attributes: row.attributes, unit: row.unit });
      expect(derived.label, row.name).toBe(row.label);
      expect(derived.attributes).toEqual(row.attributes);
    }
    const sold = rows.rows.filter((r) => r.sellable);
    expect(sold.length).toBe(menu.products.reduce((n, p) => n + p.variants.length, 0));
    const price = new Map(sold.map((r) => [`${r.name}|${r.label}`, Number(r.price_cents)]));
    for (const dish of menu.products) {
      for (const v of dish.variants) {
        expect(price.get(`${dish.name}|${v.size ?? ''}`), `${dish.name} ${v.size ?? ''}`).toBe(v.price_cents);
      }
    }
  });

  it('has the site’s photo on every dish, and the file is in the repo', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1 AND sellable`,
      [storeId]
    );
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-suncity\/[a-z0-9-]+\.(jpg|png)$/);
      expect(fs.existsSync(path.join(ROOT, 'public', row.image_url)), row.image_url).toBe(true);
    }
    const store = await pool.query(`SELECT public_logo_url FROM pos_stores WHERE id = $1`, [storeId]);
    expect(fs.existsSync(path.join(ROOT, 'public', store.rows[0].public_logo_url))).toBe(true);
  });

  it('balances: every stock row equals the sum of its movements', async () => {
    const rows = await pool.query(
      `SELECT s.variant_id, s.quantity,
              COALESCE((SELECT SUM(delta) FROM pos_stock_movements m WHERE m.variant_id = s.variant_id), 0) AS moved
       FROM pos_stock s WHERE s.store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) expect(Number(row.quantity), `variant ${row.variant_id}`).toBe(Number(row.moved));
  });

  it('charges every pizza edition the site sells at the site’s price — the 8 typos aside', async () => {
    const catalog = await getCatalog(storeId, { snapshot: true });
    const rowOf = new Map(catalog.map((r) => [`${r.product_name}|${r.label}`, r]));
    const mismatches: string[] = [];
    let checked = 0;
    for (const dish of menu.products.filter((p) => p.site_editions)) {
      for (const e of dish.site_editions!) {
        const row = rowOf.get(`${dish.name}|${e.size}`)!;
        expect(row, `${dish.name} ${e.size}`).toBeDefined();
        const answers = new Map(
          row.modifier_groups!.flatMap((g) => g.modifiers.map((m) => [`${g.name}|${m.name}`, m.price_delta_cents]))
        );
        const till =
          row.price_cents +
          (e.crust ? answers.get(`Бортики|${e.crust}`)! : 0) +
          (e.sauce ? answers.get(`Соус|${e.sauce}`)! : 0);
        checked++;
        if (till !== e.price_cents) mismatches.push(`${dish.name}|${e.size}|${e.crust}|${e.sauce}`);
      }
    }
    expect(checked).toBe(35 * 40);
    // Exactly the editions the snapshot names as the site's own typos.
    expect(mismatches.length).toBe(menu.notes.filter((n) => n.includes('адитивно')).length);
    expect(mismatches.every((m) => m.startsWith('Бос BBQ|') || m.startsWith('BBQ Gold|'))).toBe(true);
  });

  it('sells the big Double Meet with a Philadelphia crust at 590 ₴, as the site does', async () => {
    const owner = await pool.query(`SELECT id FROM pos_staff WHERE store_id = $1 AND role = 'owner'`, [storeId]);
    const ids = await pool.query(
      `SELECT (SELECT v.id FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
                WHERE v.store_id = $1 AND p.name = 'Double Meet' AND v.label = '50 см') AS pizza,
              (SELECT id FROM pos_modifiers WHERE store_id = $1 AND name = 'Філадельфія') AS crust,
              (SELECT id FROM pos_modifiers WHERE store_id = $1 AND name = 'Бургер') AS sauce`,
      [storeId]
    );
    const { pizza, crust, sauce } = ids.rows[0];
    const sale = await completeSale({
      storeId,
      staffId: Number(owner.rows[0].id),
      items: [{ variant_id: Number(pizza), quantity: 1, modifiers: [Number(crust), Number(sauce)] }],
      payments: [{ method: 'cash', amount_cents: 59000 }],
    });
    expect(sale!.items[0].unit_price_cents).toBe(59000);
    expect(sale!.items[0].variant_label).toBe('50 см · Філадельфія · Бургер');
    // A café sale goes to the kitchen board.
    const prep = await pool.query(`SELECT prep_status FROM pos_sales WHERE id = $1`, [sale!.id]);
    expect(prep.rows[0].prep_status).toBe('new');
  });

  it('carries a tech card for eight dishes, with a food cost the owner can read', async () => {
    const cards = (await listTechCards(pool, storeId)).filter((c) => c.stock_mode === 'derived');
    const sellable = await pool.query(
      `SELECT p.name FROM pos_products p WHERE p.store_id = $1 AND p.sellable AND p.kind = 'composite'`,
      [storeId]
    );
    expect(sellable.rows.map((r) => r.name).sort()).toEqual(
      [
        'Sun City',
        'Бургер Sun City з яловичою котлетою',
        'КАЛІФОРНІЯ ЛОСОСЬ',
        'Картопля Фрі',
        'Маргарита',
        'Пепероні',
        'ФІЛАДЕЛЬФІЯ КЛАСІК',
        'Шаурма',
      ].sort()
    );
    for (const card of cards.filter((c) => sellable.rows.some((r) => r.name === c.product_name))) {
      expect(card.has_unpriced_leaf, card.product_name).toBe(false);
      const pct = card.cost_cents / card.price_cents;
      expect(pct, `${card.product_name} ${card.label}`).toBeGreaterThan(0.15);
      expect(pct, `${card.product_name} ${card.label}`).toBeLessThan(0.5);
    }
  });

  it('expands the rice inside a roll — the semi-finished folds into the flat table', async () => {
    const flat = await pool.query(
      `SELECT lp.name, f.quantity_per_unit
       FROM pos_product_components_flat f
       JOIN pos_variants v ON v.id = f.variant_id JOIN pos_products p ON p.id = v.product_id
       JOIN pos_variants lv ON lv.id = f.leaf_variant_id JOIN pos_products lp ON lp.id = lv.product_id
       WHERE f.store_id = $1 AND p.name = 'ФІЛАДЕЛЬФІЯ КЛАСІК'`,
      [storeId]
    );
    const leaves = Object.fromEntries(flat.rows.map((r) => [r.name, Number(r.quantity_per_unit)]));
    // 3 portions × 35 г of rice and × 3 мл of vinegar; the portion itself is no leaf.
    expect(leaves['Рис круглозерний']).toBe(105);
    expect(leaves['Оцет рисовий']).toBe(9);
    expect(leaves).not.toHaveProperty('Рис для суші, порція 50 г');
  });

  it('keeps the ingredients off the sell screen', async () => {
    const catalog = await getCatalog(storeId, { snapshot: true });
    expect(catalog.some((r) => r.product_name === 'Моцарела')).toBe(false);
    const withStock = await getCatalog(storeId, { snapshot: true, includeUnsellable: true });
    expect(withStock.some((r) => r.product_name === 'Моцарела')).toBe(true);
  });

  it('publishes the guest menu with the place’s own header, and no ordering', async () => {
    const row = await pool.query(
      `SELECT public_menu_token, public_menu_enabled, public_menu_ordering, public_logo_url,
              public_address, public_phone, public_hours
       FROM pos_stores WHERE id = $1`,
      [storeId]
    );
    expect(row.rows[0]).toMatchObject({
      public_menu_token: 'demo-suncity-menu',
      public_menu_enabled: true,
      public_menu_ordering: false,
      public_logo_url: '/demo-suncity/logo.png',
      public_address: 'вул. 10 ОГШБ 52а, м. Малин',
      public_phone: '+380684868060',
    });
    expect(Object.keys(row.rows[0].public_hours)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(row.rows[0].public_hours['5']).toEqual({ open: '11:00', close: '22:30' });
  });

  it('carries the credentials the migration header advertises', async () => {
    const staff = await pool.query(
      `SELECT role, login, password_hash, pin_hash FROM pos_staff WHERE store_id = $1`,
      [storeId]
    );
    const owner = staff.rows.find((r) => r.role === 'owner')!;
    const seller = staff.rows.find((r) => r.role === 'seller')!;
    expect(owner.login).toBe('owner@suncity.shop');
    expect(await verifyPassword('owner123', owner.password_hash)).toBe(true);
    expect(await verifyPin('0000', owner.pin_hash)).toBe(true);
    expect(await verifyPin('1234', seller.pin_hash)).toBe(true);
  });

  it('ships no module remote — a dev URL must never reach production', () => {
    const sql = readMigration(MIGRATION)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toContain('module_remotes');
    expect(sql).not.toContain('localhost');
  });

  it('is idempotent — re-running the migration changes nothing', async () => {
    const fingerprint = async () =>
      (
        await pool.query(
          `SELECT md5(string_agg(id::text, ',' ORDER BY id)) AS ids, COUNT(*) AS n
           FROM pos_variants WHERE store_id = $1`,
          [storeId]
        )
      ).rows[0];
    const before = await fingerprint();
    await pool.query(readMigration(MIGRATION));
    expect(await fingerprint()).toEqual(before);
  });

  it('rebuilds an older build, keeping the store, its staff and its module entry', async () => {
    const url = 'https://cdn.example/vertical-cafe/remote-entry.js';
    await pool.query(
      `UPDATE pos_stores SET module_remotes = jsonb_build_object('vertical-cafe', jsonb_build_object('url', $2::text))
       WHERE id = $1`,
      [storeId, url]
    );
    const staffBefore = await pool.query(`SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`, [storeId]);
    await pool.query(`UPDATE pos_stores SET public_address = 'Змінив власник' WHERE id = $1`, [storeId]);
    await pool.query(`UPDATE pos_demo_seed SET version = 0 WHERE slug = $1`, [SLUG]);

    await pool.query(readMigration(MIGRATION));

    const after = await pool.query(
      `SELECT (SELECT id FROM pos_stores WHERE slug = $2) AS store_id,
              module_remotes -> 'vertical-cafe' ->> 'url' AS module_url,
              public_address,
              (SELECT COUNT(*) FROM pos_sales WHERE store_id = $1) AS sales,
              (SELECT COUNT(*) FROM pos_products WHERE store_id = $1 AND sellable) AS dishes,
              (SELECT version FROM pos_demo_seed WHERE slug = $2) AS stamp
       FROM pos_stores WHERE id = $1`,
      [storeId, SLUG]
    );
    expect(Number(after.rows[0].store_id)).toBe(storeId);
    expect(after.rows[0].module_url).toBe(url);
    // The owner's own edit to the header survives a catalogue rebuild.
    expect(after.rows[0].public_address).toBe('Змінив власник');
    expect(Number(after.rows[0].sales)).toBe(0);
    expect(Number(after.rows[0].dishes)).toBe(menu.products.length);
    expect(Number(after.rows[0].stamp)).toBeGreaterThan(0);
    const staffAfter = await pool.query(`SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`, [storeId]);
    expect(staffAfter.rows).toEqual(staffBefore.rows);

    await pool.query(
      `UPDATE pos_stores SET module_remotes = '{}'::jsonb, public_address = 'вул. 10 ОГШБ 52а, м. Малин'
       WHERE id = $1`,
      [storeId]
    );
  });
});
