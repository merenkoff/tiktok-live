// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { readMigration } from '../pos/migrations.js';
import { groceryVertical } from '../pos/verticals/grocery.js';
import { normalizeVariant } from '../pos/verticals/attributes.js';
import { verifyPassword, verifyPin } from '../pos/core/crypto.js';
import { verifyCheckDigit } from '../pos/gtin/normalize.js';
import { completeSale } from '../pos/sales.service.js';

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public'
);

const MIGRATION = '076_pos_demo_grocery_store.sql';

/**
 * Migration `076` ships the «Demo Grocery» store as data, with the risks 055
 * has — hand-written captions drifting from the vertical's rule, stock that
 * stops adding up, barcodes that do not scan — and one of its own: a weighed
 * good is three numbers in three different units (a price per kilogram, a
 * cost per gram, a quantity in grams), and a slip in any of them is a demo
 * that sells 350 g of cheese for 66 000 ₴ or buys it for nothing.
 */
describe.skipIf(!hasDb)('demo grocery store (migration 076)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-grocery'`);
    expect(store.rows.length, 'migration 076 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 60000);

  afterAll(async () => {
    await pool.end();
  });

  it('is on the grocery vertical', async () => {
    const row = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
    expect(row.rows[0].vertical).toBe('grocery');
  });

  it('writes every caption and price basis the grocery rule would have derived', async () => {
    const rows = await pool.query(
      `SELECT v.id, v.attributes, v.label, v.unit, v.price_per, p.name
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 ORDER BY v.id`,
      [storeId]
    );
    expect(rows.rows.length).toBe(25);
    for (const row of rows.rows) {
      const derived = normalizeVariant(groceryVertical, {
        attributes: row.attributes,
        unit: row.unit,
      });
      expect(derived.label, `${row.name} (variant ${row.id})`).toBe(row.label);
      expect(derived.attributes).toEqual(row.attributes);
      expect(derived.price_per, `${row.name} (${row.unit})`).toBe(Number(row.price_per));
    }
  });

  it('carries 22 simple products: 14 weighed variants and 11 packed ones', async () => {
    const counts = await pool.query(
      `SELECT p.kind, p.stock_mode, v.unit, v.price_per,
              COUNT(DISTINCT p.id)::int AS products, COUNT(*)::int AS variants
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1
       GROUP BY p.kind, p.stock_mode, v.unit, v.price_per
       ORDER BY v.unit`,
      [storeId]
    );
    expect(counts.rows).toEqual([
      { kind: 'simple', stock_mode: 'own', unit: 'г', price_per: 1000, products: 11, variants: 13 },
      { kind: 'simple', stock_mode: 'own', unit: 'мл', price_per: 1000, products: 1, variants: 1 },
      { kind: 'simple', stock_mode: 'own', unit: 'шт', price_per: 1, products: 10, variants: 11 },
    ]);
  });

  it('has a picture on every product, and the file is in the repo', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    expect(rows.rows.length).toBe(22);
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-grocery\/[a-z0-9-]+\.svg$/);
      expect(
        fs.existsSync(path.join(PUBLIC_DIR, row.image_url)),
        `${row.name} → ${row.image_url} missing`
      ).toBe(true);
    }
  });

  it('gives every variant a unique SKU and a scannable EAN-13: the maker\'s 482… on a pack, the shop\'s own 29… on a weighed good', async () => {
    const rows = await pool.query(
      `SELECT sku, barcode, unit FROM pos_variants WHERE store_id = $1`,
      [storeId]
    );
    expect(new Set(rows.rows.map((r) => r.sku)).size).toBe(rows.rows.length);
    expect(new Set(rows.rows.map((r) => r.barcode)).size).toBe(rows.rows.length);
    for (const row of rows.rows) {
      // `29…` is the range every code this POS mints lives in (internal-code.ts):
      // the price tag of a weighed good carries one, and scanning it opens the pad.
      expect(row.barcode, `${row.sku} (${row.unit})`).toMatch(
        row.unit === 'шт' ? /^482\d{10}$/ : /^29\d{11}$/
      );
      expect(verifyCheckDigit(row.barcode), `${row.barcode} check digit`).toBe(true);
    }
  });

  it('buys cheaper than it sells, in the right units: cost is 35–85 % of the price', async () => {
    // A weighed good's price is per kilogram or litre and its cost per gram or
    // millilitre (migration 075), so the cost is scaled by `price_per` before
    // comparing. A cost typed per kilogram would read 1000× the price here, and
    // one typed per 100 g a tenth of it.
    const rows = await pool.query(
      `SELECT sku, price_cents, cost_cents, price_per FROM pos_variants WHERE store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      const ratio = (Number(row.cost_cents) * Number(row.price_per)) / Number(row.price_cents);
      const what = `${row.sku}: cost ${row.cost_cents} × ${row.price_per} of price ${row.price_cents}`;
      expect(ratio, what).toBeGreaterThan(0.35);
      expect(ratio, what).toBeLessThan(0.85);
    }
  });

  it('keeps weighed stock in grams: kilograms on the shelf, never a handful of pieces', async () => {
    const rows = await pool.query(
      `SELECT v.sku, v.unit, s.quantity
       FROM pos_variants v JOIN pos_stock s ON s.variant_id = v.id
       WHERE v.store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      if (row.unit === 'шт') {
        expect(row.quantity, row.sku).toBeLessThan(100);
      } else {
        // At least a kilogram (or a litre) of everything sold by weight.
        expect(row.quantity, row.sku).toBeGreaterThanOrEqual(1000);
      }
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
    expect(owner.login).toBe('owner@grocery.shop');
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

  it('deletes, on a rebuild, every table that holds on to a variant', async () => {
    // A rebuild that trips a foreign key fails the migration, and a failed
    // migration keeps the API from starting. A table added later that
    // RESTRICTs a variant must be deleted here too — behind a `to_regclass`
    // guard and an EXECUTE if its migration comes after this one (see 055).
    const sql = readMigration(MIGRATION);
    const holders = await pool.query(
      `SELECT DISTINCT conrelid::regclass::text AS tbl
       FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'pos_variants'::regclass
         AND confdeltype IN ('a', 'r')
       ORDER BY 1`
    );
    expect(holders.rows.length).toBeGreaterThan(5);
    for (const { tbl } of holders.rows) {
      expect(sql, `${tbl} is not deleted before the variants`).toMatch(
        new RegExp(`DELETE FROM ${tbl}\\b`)
      );
    }
  });

  it('sells 350 g of its cheese for 66,47 ₴', async () => {
    const cheese = await pool.query(
      `SELECT id FROM pos_variants WHERE store_id = $1 AND sku = 'CHS-GOUDA'`,
      [storeId]
    );
    const seller = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 AND role = 'seller' ORDER BY id LIMIT 1`,
      [storeId]
    );
    const sale = await completeSale({
      storeId,
      staffId: Number(seller.rows[0].id),
      items: [{ variant_id: Number(cheese.rows[0].id), quantity: 350, weight_source: 'manual' }],
      payments: [{ method: 'cash', amount_cents: 10000 }],
      client_uuid: randomUUID(),
    });
    expect(sale.total_cents).toBe(6647);
    expect(sale.items[0]).toMatchObject({ quantity: 350, unit: 'г', line_total_cents: 6647 });

    const left = await pool.query(
      `SELECT quantity FROM pos_stock WHERE variant_id = $1`,
      [cheese.rows[0].id]
    );
    expect(Number(left.rows[0].quantity)).toBe(5200 - 350);
  });

  it('is idempotent — re-running the migration changes nothing', async () => {
    const shape = async () =>
      (
        await pool.query(
          `SELECT (SELECT COUNT(*) FROM pos_stores WHERE slug = 'demo-grocery') AS stores,
                  (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
                  (SELECT COUNT(*) FROM pos_stock_movements WHERE store_id = $1) AS moves,
                  (SELECT md5(string_agg(id::text || barcode, ',' ORDER BY id))
                     FROM pos_variants WHERE store_id = $1) AS variant_codes,
                  (SELECT version FROM pos_demo_seed WHERE slug = 'demo-grocery') AS stamp`,
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
    const url = 'https://cdn.example/test@v9/vertical-grocery/remote-entry.js';
    await pool.query(
      `UPDATE pos_stores
          SET module_remotes = jsonb_build_object('vertical-grocery', $2::text)
        WHERE id = $1`,
      [storeId, url]
    );
    const staffBefore = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );
    // What a visitor of the public demo can leave behind: a sale by weight,
    // and a modifier that writes off one of the goods (core routes, whatever
    // the grocery screens offer). Both hold on to a variant.
    const loaf = await pool.query(
      `SELECT id FROM pos_variants WHERE store_id = $1 AND sku = 'BRD-LOAF'`,
      [storeId]
    );
    const salami = await pool.query(
      `SELECT id FROM pos_variants WHERE store_id = $1 AND sku = 'SSG-SAL'`,
      [storeId]
    );
    await completeSale({
      storeId,
      staffId: Number(staffBefore.rows[0].id),
      items: [{ variant_id: Number(salami.rows[0].id), quantity: 120, weight_source: 'manual' }],
      payments: [{ method: 'cash', amount_cents: 10000 }],
      client_uuid: randomUUID(),
    });
    const group = await pool.query(
      `INSERT INTO pos_modifier_groups (store_id, name) VALUES ($1, 'Нарізати?') RETURNING id`,
      [storeId]
    );
    await pool.query(
      `INSERT INTO pos_modifiers (store_id, group_id, name, component_variant_id, component_quantity)
       VALUES ($1, $2, 'Так, з хлібом', $3, 1)`,
      [storeId, group.rows[0].id, loaf.rows[0].id]
    );
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-grocery'`);

    await pool.query(readMigration(MIGRATION));

    const after = await pool.query(
      `SELECT (SELECT id FROM pos_stores WHERE slug = 'demo-grocery') AS store_id,
              (SELECT module_remotes ->> 'vertical-grocery' FROM pos_stores WHERE id = $1) AS module_url,
              (SELECT COUNT(*) FROM pos_sales WHERE store_id = $1) AS sales,
              (SELECT COUNT(*) FROM pos_modifiers WHERE store_id = $1) AS modifiers,
              (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
              (SELECT quantity FROM pos_stock s JOIN pos_variants v ON v.id = s.variant_id
                WHERE v.store_id = $1 AND v.sku = 'SSG-SAL') AS salami_left,
              (SELECT version FROM pos_demo_seed WHERE slug = 'demo-grocery') AS stamp`,
      [storeId]
    );
    expect(Number(after.rows[0].store_id)).toBe(storeId);
    expect(after.rows[0].module_url).toBe(url);
    expect(Number(after.rows[0].sales)).toBe(0);
    expect(Number(after.rows[0].modifiers)).toBe(0);
    expect(Number(after.rows[0].variants)).toBe(25);
    expect(Number(after.rows[0].salami_left)).toBe(2600);
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
        WHERE store_id = $1 AND sku = 'MLK-25'`,
      [storeId]
    );
    await pool.query(readMigration(MIGRATION));
    const edited = await pool.query(
      `SELECT COUNT(*) AS n FROM pos_variants WHERE store_id = $1 AND price_cents = 99999`,
      [storeId]
    );
    expect(Number(edited.rows[0].n)).toBe(1);

    await pool.query(
      `UPDATE pos_variants SET price_cents = 4690
        WHERE store_id = $1 AND sku = 'MLK-25'`,
      [storeId]
    );
  });
});
