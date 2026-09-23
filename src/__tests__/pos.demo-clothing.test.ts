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
import { clothingVertical } from '../pos/verticals/clothing.js';
import { normalizeVariant } from '../pos/verticals/attributes.js';
import { verifyPassword, verifyPin } from '../pos/core/crypto.js';
import { verifyCheckDigit } from '../pos/gtin/normalize.js';

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public'
);

const MIGRATION = '055_pos_demo_clothing_store.sql';

/**
 * Migration `055` ships the «Demo Clothing» store as data, with the same two
 * risks 039 has: hand-written captions can drift from the vertical's rule, and
 * hand-written stock numbers can stop adding up. Clothing adds a third — every
 * variant carries a barcode, and a barcode that does not scan is worse than
 * none, so the check digits are verified too.
 */
describe.skipIf(!hasDb)('demo clothing store (migration 055)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-clothing'`);
    expect(store.rows.length, 'migration 055 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 60000);

  afterAll(async () => {
    await pool.end();
  });

  it('is on the clothing vertical', async () => {
    const row = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
    expect(row.rows[0].vertical).toBe('clothing');
  });

  it('writes every caption the clothing rule would have derived', async () => {
    const rows = await pool.query(
      `SELECT v.id, v.attributes, v.label, v.unit, p.name
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 ORDER BY v.id`,
      [storeId]
    );
    expect(rows.rows.length).toBeGreaterThan(40);
    for (const row of rows.rows) {
      const derived = normalizeVariant(clothingVertical, {
        attributes: row.attributes,
        unit: row.unit,
      });
      expect(derived.label, `${row.name} (variant ${row.id})`).toBe(row.label);
      expect(derived.attributes).toEqual(row.attributes);
    }
  });

  it('carries 16 simple products and 58 variants, nothing composite', async () => {
    const counts = await pool.query(
      `SELECT p.kind, p.stock_mode,
              COUNT(DISTINCT p.id)::int AS products, COUNT(*)::int AS variants
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 GROUP BY p.kind, p.stock_mode`,
      [storeId]
    );
    expect(counts.rows).toEqual([
      { kind: 'simple', stock_mode: 'own', products: 16, variants: 58 },
    ]);
  });

  it('has a picture on every product, and the file is in the repo', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-clothing\/[a-z0-9-]+\.svg$/);
      expect(
        fs.existsSync(path.join(PUBLIC_DIR, row.image_url)),
        `${row.name} → ${row.image_url} missing`
      ).toBe(true);
    }
  });

  it('gives every variant a unique SKU and a scannable EAN-13', async () => {
    const rows = await pool.query(
      `SELECT sku, barcode FROM pos_variants WHERE store_id = $1`,
      [storeId]
    );
    const skus = rows.rows.map((r) => r.sku);
    const codes = rows.rows.map((r) => r.barcode);
    expect(new Set(skus).size).toBe(rows.rows.length);
    expect(new Set(codes).size).toBe(rows.rows.length);
    for (const code of codes) {
      expect(code, code).toMatch(/^482\d{10}$/);
      expect(verifyCheckDigit(code), `${code} check digit`).toBe(true);
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

  it('carries the credentials the migration header advertises', async () => {
    const staff = await pool.query(
      `SELECT role, login, password_hash, pin_hash FROM pos_staff
       WHERE store_id = $1 ORDER BY role`,
      [storeId]
    );
    const owner = staff.rows.find((r) => r.role === 'owner')!;
    const seller = staff.rows.find((r) => r.role === 'seller')!;
    expect(owner.login).toBe('owner@clothing.shop');
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
          `SELECT (SELECT COUNT(*) FROM pos_stores WHERE slug = 'demo-clothing') AS stores,
                  (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
                  (SELECT COUNT(*) FROM pos_stock_movements WHERE store_id = $1) AS moves,
                  (SELECT md5(string_agg(id::text, ',' ORDER BY id))
                     FROM pos_products WHERE store_id = $1) AS product_ids,
                  (SELECT version FROM pos_demo_seed WHERE slug = 'demo-clothing') AS stamp`,
          [storeId]
        )
      ).rows[0];

    const before = await shape();
    await pool.query(readMigration(MIGRATION));
    expect(await shape()).toEqual(before);
    expect(Number(before.stores)).toBe(1);
    expect(Number(before.stamp)).toBeGreaterThan(0);
  });

  it('rebuilds an un-stamped store, keeping what its owner set', async () => {
    const url = 'https://cdn.example/test@v9/tiktok-live/remote-entry.js';
    await pool.query(
      `UPDATE pos_stores
          SET module_remotes = jsonb_build_object(
                'tiktok-live',
                jsonb_build_object('url', $2::text, 'title', 'Прямий ефір', 'routePath', '/live'))
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
    await pool.query(
      `INSERT INTO pos_sale_items
         (sale_id, store_id, variant_id, product_name, quantity, unit_price_cents, line_total_cents)
       SELECT $2, $1, id, 'before the rebuild', 1, 100, 100
         FROM pos_variants WHERE store_id = $1 ORDER BY id LIMIT 1`,
      [storeId, sale.rows[0].id]
    );
    await pool.query(
      `INSERT INTO pos_products (store_id, name, kind, stock_mode)
       VALUES ($1, 'Футболка (старий сид)', 'simple', 'own')`,
      [storeId]
    );
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-clothing'`);

    await pool.query(readMigration(MIGRATION));

    const after = await pool.query(
      `SELECT (SELECT id FROM pos_stores WHERE slug = 'demo-clothing') AS store_id,
              (SELECT module_remotes -> 'tiktok-live' ->> 'url'
                 FROM pos_stores WHERE id = $1) AS module_url,
              (SELECT COUNT(*) FROM pos_sales WHERE store_id = $1) AS sales,
              (SELECT COUNT(*) FROM pos_products
                WHERE store_id = $1 AND name = 'Футболка (старий сид)') AS leftovers,
              (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
              (SELECT version FROM pos_demo_seed WHERE slug = 'demo-clothing') AS stamp`,
      [storeId]
    );
    expect(Number(after.rows[0].store_id)).toBe(storeId);
    expect(after.rows[0].module_url).toBe(url);
    expect(Number(after.rows[0].sales)).toBe(0);
    expect(Number(after.rows[0].leftovers)).toBe(0);
    expect(Number(after.rows[0].variants)).toBe(58);
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
    await pool.query(
      `UPDATE pos_variants SET price_cents = 99999
        WHERE store_id = $1 AND sku = 'TEE-BLK-M'`,
      [storeId]
    );
    await pool.query(readMigration(MIGRATION));
    const edited = await pool.query(
      `SELECT COUNT(*) AS n FROM pos_variants WHERE store_id = $1 AND price_cents = 99999`,
      [storeId]
    );
    expect(Number(edited.rows[0].n)).toBe(1);

    await pool.query(
      `UPDATE pos_variants SET price_cents = 69000
        WHERE store_id = $1 AND sku = 'TEE-BLK-M'`,
      [storeId]
    );
  });
});
