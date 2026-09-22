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
import { verifyPassword, verifyPin } from '../pos/core/crypto.js';
import { getCatalog } from '../pos/products.service.js';

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public'
);

const MIGRATION = '053_pos_demo_restaurant.sql';

/**
 * Migration `053` ships «Demo Restaurant» as data — the café vertical's second
 * demo and the one that shows table service. It carries 048's risks (SQL drift,
 * hand-written stock that stops adding up, a `_flat` table it has to rebuild
 * itself because 045 ran first) plus two of its own:
 *
 *   * it TAKES the floor plan away from `demo-cafe`, unconditionally and on
 *     every boot, so the café stays the counter-service demo;
 *   * its menu is where the three shapes of modifier live side by side, and
 *     the one that writes nothing off is the easiest to break by "tidying".
 */
describe.skipIf(!hasDb)('demo restaurant store (migration 053)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(
      `SELECT id FROM pos_stores WHERE slug = 'demo-restaurant'`
    );
    expect(store.rows.length, 'migration 053 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 60000);

  afterAll(async () => {
    await pool.end();
  });

  const variantByName = async (name: string) => {
    const row = await pool.query(
      `SELECT v.id FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND p.name = $2`,
      [storeId, name]
    );
    expect(row.rows.length, name).toBe(1);
    return Number(row.rows[0].id);
  };

  it('is a café-vertical store with two rooms and ten tables', async () => {
    const store = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
    expect(store.rows[0].vertical).toBe('cafe');

    const halls = await pool.query(
      `SELECT name FROM pos_halls WHERE store_id = $1 ORDER BY sort_order`,
      [storeId]
    );
    expect(halls.rows.map((r) => r.name)).toEqual(['Зала', 'Тераса']);

    const tables = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_tables WHERE store_id = $1`,
      [storeId]
    );
    expect(tables.rows[0].n).toBe(10);
  });

  it('leaves the rooms empty — a seeded bill would age', async () => {
    const bills = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_bills WHERE store_id = $1`,
      [storeId]
    );
    expect(bills.rows[0].n).toBe(0);
  });

  // The whole reason this file replaced the old one.
  it('takes the floor plan away from the café, which is counter-service', async () => {
    const cafe = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-cafe'`);
    expect(cafe.rows.length, 'migration 048 did not create the café').toBe(1);
    const cafeId = Number(cafe.rows[0].id);

    const halls = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_halls WHERE store_id = $1`,
      [cafeId]
    );
    expect(halls.rows[0].n, 'demo-cafe must have no rooms').toBe(0);

    const stamp = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_demo_seed WHERE slug = 'demo-cafe-hall'`
    );
    expect(stamp.rows[0].n, 'the old stamp describes nothing and must be gone').toBe(0);
  });

  it('routes its tags to a station: food to the kitchen, drinks to the bar', async () => {
    const rows = await pool.query(
      `SELECT name, station FROM pos_tags WHERE store_id = $1 ORDER BY sort_order`,
      [storeId]
    );
    const byName = Object.fromEntries(rows.rows.map((r) => [r.name, r.station]));
    expect(byName['Гаряче']).toBe('kitchen');
    expect(byName['Супи']).toBe('kitchen');
    expect(byName['Закуски']).toBe('kitchen');
    expect(byName['Бар']).toBe('bar');
    expect(byName['Вино']).toBe('bar');
    // Ingredients are never cooked and never printed.
    expect(byName['Інгредієнти']).toBeNull();
  });

  it('has a picture for every product, and each file exists', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    expect(rows.rows.length).toBeGreaterThan(40);
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-restaurant\/[a-z-]+\.svg$/);
      const file = path.join(PUBLIC_DIR, row.image_url.replace(/^\//, ''));
      expect(fs.existsSync(file), `${row.name} → ${row.image_url}`).toBe(true);
    }
  });

  it('keeps the menu off the ingredient shelf and the ingredients off the menu', async () => {
    const menu = await getCatalog(storeId);
    const names = menu.map((i) => i.product_name);
    expect(names).toContain('Стейк Рібай');
    expect(names).toContain('Борщ український');
    expect(names).not.toContain('Рібай');
    expect(names).not.toContain('Гарнір: пюре');
    expect(names).not.toContain('Соус демі-глас, порція');
  });

  // The two nesting modes, which is what the café vertical bought with
  // `maxCompositionDepth: 3`.
  it('folds a derived recipe into its parent and leaves an own one a leaf', async () => {
    const borscht = await variantByName('Борщ український');
    const flat = await pool.query(
      `SELECT p.name, f.quantity_per_unit AS qty
         FROM pos_product_components_flat f
         JOIN pos_variants v ON v.id = f.leaf_variant_id
         JOIN pos_products p ON p.id = v.product_id
        WHERE f.variant_id = $1 ORDER BY p.name`,
      [borscht]
    );
    const byName = Object.fromEntries(flat.rows.map((r) => [r.name, r.qty]));
    // The stock is `derived`: it is gone, its contents are here.
    expect(byName['Бульйон яловичий, порція']).toBeUndefined();
    expect(byName['Яловичина']).toBe(80);
    expect(byName['Вода']).toBe(300);
    expect(byName['Буряк']).toBe(120);

    const steak = await variantByName('Стейк Рібай');
    const steakFlat = await pool.query(
      `SELECT p.name FROM pos_product_components_flat f
         JOIN pos_variants v ON v.id = f.leaf_variant_id
         JOIN pos_products p ON p.id = v.product_id
        WHERE f.variant_id = $1`,
      [steak]
    );
    const steakNames = steakFlat.rows.map((r) => r.name);
    // The demi-glace is `own`: it was simmered in advance, so it stays a leaf
    // and selling a steak takes the portion, not the beef it was made from.
    expect(steakNames).toContain('Соус демі-глас, порція');
    expect(steakNames).not.toContain('Морква');
  });

  it('carries all three shapes of modifier', async () => {
    const rows = await pool.query(
      `SELECT g.name AS grp, g.min_select, g.max_select, m.name AS answer,
              m.price_delta_cents AS delta, m.component_variant_id AS part, m.is_default
         FROM pos_modifiers m
         JOIN pos_modifier_groups g ON g.id = m.group_id
        WHERE m.store_id = $1 ORDER BY g.sort_order, m.sort_order`,
      [storeId]
    );

    // 1. An instruction to the kitchen: no price, nothing off the shelf, and
    //    required with no default so the till must ask.
    const doneness = rows.rows.filter((r) => r.grp === 'Просмаження');
    expect(doneness.map((r) => r.answer)).toEqual(['з кровʼю', 'середнє', 'повне']);
    for (const r of doneness) {
      expect(r.delta).toBe(0);
      expect(r.part).toBeNull();
      expect(r.is_default).toBe(false);
    }
    expect(doneness[0].min_select).toBe(1);

    // 2. A real side: every answer writes one off, the dearer one also costs.
    const sides = rows.rows.filter((r) => r.grp === 'Гарнір');
    for (const r of sides) expect(r.part, r.answer).not.toBeNull();
    expect(sides.find((r) => r.answer === 'овочі гриль')!.delta).toBe(2500);
    expect(sides.filter((r) => r.is_default).length, 'exactly one default side').toBe(1);

    // 3. Both at once.
    const sauces = rows.rows.filter((r) => r.grp === 'Соус');
    for (const r of sauces) {
      expect(r.delta, r.answer).toBeGreaterThan(0);
      expect(r.part, r.answer).not.toBeNull();
    }
  });

  it('sells the salmon as out of stock rather than hiding it', async () => {
    const menu = await getCatalog(storeId);
    const salmon = menu.find((i) => i.product_name === 'Лосось на грилі');
    expect(salmon, 'the dish must still be on the menu').toBeDefined();
    expect(salmon!.quantity).toBe(0);
  });

  it('balances: what the production document took equals what it made', async () => {
    const doc = await pool.query(
      `SELECT id FROM pos_stock_documents
        WHERE store_id = $1 AND type = 'production' AND status = 'posted'`,
      [storeId]
    );
    expect(doc.rows.length, 'one posted production document').toBe(1);

    const moves = await pool.query(
      `SELECT SUM(CASE WHEN delta > 0 THEN 1 ELSE 0 END)::int AS made,
              SUM(CASE WHEN delta < 0 THEN 1 ELSE 0 END)::int AS took
         FROM pos_stock_movements
        WHERE store_id = $1 AND reference_type = 'stock_document' AND reference_id = $2`,
      [storeId, doc.rows[0].id]
    );
    expect(moves.rows[0].made, 'the portions made').toBe(1);
    expect(moves.rows[0].took, 'the four components it took').toBe(4);

    // And the shelf agrees with the movements, for every variant of the store.
    const drift = await pool.query(
      `SELECT p.name FROM pos_stock s
         JOIN pos_variants v ON v.id = s.variant_id
         JOIN pos_products p ON p.id = v.product_id
        WHERE s.store_id = $1
          AND s.quantity <> COALESCE((
            SELECT SUM(m.delta) FROM pos_stock_movements m
             WHERE m.variant_id = s.variant_id AND m.store_id = s.store_id), 0)`,
      [storeId]
    );
    expect(drift.rows.map((r) => r.name), 'stock must equal the sum of its movements').toEqual([]);
  });

  it('signs in with the credentials the file advertises', async () => {
    const owner = await pool.query(
      `SELECT password_hash, pin_hash FROM pos_staff
        WHERE store_id = $1 AND role = 'owner'`,
      [storeId]
    );
    expect(await verifyPassword('owner123', owner.rows[0].password_hash)).toBe(true);

    const waiters = await pool.query(
      `SELECT display_name, pin_hash FROM pos_staff
        WHERE store_id = $1 AND role = 'seller' ORDER BY id`,
      [storeId]
    );
    expect(waiters.rows.length, 'two waiters — «усі бачать усе» needs two').toBe(2);
    for (const w of waiters.rows) {
      expect(await verifyPin('1234', w.pin_hash), w.display_name).toBe(true);
    }
  });

  it('writes no module_remotes and no localhost into the database', () => {
    // Comments stripped, as in 048's test: the header SAYS the file writes no
    // `module_remotes`, and the point is that the SQL below it doesn't.
    const sql = readMigration(MIGRATION)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toContain('module_remotes');
    expect(sql).not.toContain('localhost');
  });
});
