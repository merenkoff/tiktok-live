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
import { flowersVertical } from '../pos/verticals/flowers.js';
import { normalizeVariant } from '../pos/verticals/attributes.js';
import { verifyPassword, verifyPin } from '../pos/core/crypto.js';
import { getCatalog } from '../pos/products.service.js';

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public'
);

/**
 * Migration `039` ships the «Demo Flowers» store as data, which buys two risks
 * a schema migration does not have: hand-written SQL can drift from the code
 * that would otherwise have produced the same rows, and hand-written stock
 * numbers can stop adding up. Both are pinned here.
 */
describe.skipIf(!hasDb)('demo flowers store (migration 039)', () => {
  let storeId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-flowers'`);
    expect(store.rows.length, 'migration 039 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
  }, 60000);

  afterAll(async () => {
    await pool.end();
  });

  it('is on the flowers vertical', async () => {
    const row = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId]);
    expect(row.rows[0].vertical).toBe('flowers');
  });

  it('writes every caption the flowers rule would have derived', async () => {
    // The guard the migration's header promises. SQL cannot call `labelOf`, so
    // the captions are typed out there; this re-derives each one through the
    // real vertical and fails the moment the two disagree.
    const rows = await pool.query(
      `SELECT v.id, v.attributes, v.label, v.unit, p.name
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 ORDER BY v.id`,
      [storeId]
    );
    expect(rows.rows.length).toBeGreaterThan(20);
    for (const row of rows.rows) {
      const derived = normalizeVariant(flowersVertical, {
        attributes: row.attributes,
        unit: row.unit,
      });
      expect(derived.label, `${row.name} (variant ${row.id})`).toBe(row.label);
      // `normalizeVariant` throws on an attribute the vertical does not know,
      // so reaching here also proves the bags are writable through the API.
      expect(derived.attributes).toEqual(row.attributes);
    }
  });

  it('carries 20 stem variants and 5 bouquets', async () => {
    const counts = await pool.query(
      `SELECT p.kind, p.stock_mode, COUNT(*)::int AS n
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 GROUP BY p.kind, p.stock_mode ORDER BY p.kind, p.stock_mode`,
      [storeId]
    );
    const by = Object.fromEntries(
      counts.rows.map((r) => [`${r.kind}/${r.stock_mode}`, Number(r.n)])
    );
    // 20 stems and greenery + 3 consumables.
    expect(by['simple/own']).toBe(23);
    expect(by['composite/own']).toBe(2);
    expect(by['composite/derived']).toBe(3);
  });

  it('has a picture on every product, and the file is in the repo', async () => {
    const rows = await pool.query(
      `SELECT name, image_url FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    for (const row of rows.rows) {
      expect(row.image_url, row.name).toMatch(/^\/demo-flowers\/[a-z0-9-]+\.svg$/);
      // `public/` is served at '/', so the URL is a path under it.
      expect(
        fs.existsSync(path.join(PUBLIC_DIR, row.image_url)),
        `${row.name} → ${row.image_url} missing`
      ).toBe(true);
    }
  });

  it('balances: every stock row equals the sum of its movements', async () => {
    // What makes the two ready bouquets honest — their stems were taken off the
    // shelf by a real production document, not by a fudged number.
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

  it('posted a production document per ready bouquet, costed from the stems', async () => {
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
      ['Букет «Ранкова свіжість»', 4, 11 * 2000 + 3 * 2400 + 1500],
      ['Букет «Комплімент»', 6, 9 * 2700 + 5 * 1900 + 1500 + 900],
    ]);
    expect(docs.rows.every((r) => r.status === 'posted')).toBe(true);
  });

  it('leaves the document counter past the numbers it used', async () => {
    // Otherwise the store's first real production document would collide.
    const used = await pool.query(
      `SELECT doc_number FROM pos_stock_documents
       WHERE store_id = $1 AND type = 'production' ORDER BY doc_number DESC LIMIT 1`,
      [storeId]
    );
    const year = new Date().getFullYear();
    const counter = await pool.query(
      `SELECT next_value FROM pos_store_counters WHERE store_id = $1 AND counter_key = $2`,
      [storeId, `production_${year}`]
    );
    expect(String(used.rows[0].doc_number)).toBe(`ВР-${year}-00002`);
    expect(Number(counter.rows[0].next_value)).toBe(3);
  });

  it('shows each derived bouquet at what its components allow', async () => {
    const catalog = await getCatalog(storeId, { snapshot: true, vertical: flowersVertical });
    const qty = (name: string) =>
      catalog.find((item) => item.product_name === name)?.quantity;
    // 90 Freedom 60 / 9; 120 Freedom 50 / 25; 55 eustoma / 7.
    expect(qty('Букет «Ніжність»')).toBe(10);
    expect(qty('Букет «Класика 25»')).toBe(4);
    expect(qty('Букет «Літній настрій»')).toBe(7);
    // The ready ones are counted on their own rows, not derived.
    expect(qty('Букет «Ранкова свіжість»')).toBe(4);
    expect(qty('Букет «Комплімент»')).toBe(6);
  });

  it('keeps the expanded recipes equal to the authored ones — flowers are one level deep', async () => {
    // Migration 045 rebuilds `pos_product_components_flat` on every boot, and
    // 039 rebuilds this catalogue on a version bump — the two must agree, or
    // a demo bouquet would sell from a recipe the flowers rule never allowed.
    const authored = await pool.query(
      `SELECT variant_id, component_variant_id AS leaf, quantity
       FROM pos_product_components WHERE store_id = $1
       ORDER BY variant_id, component_variant_id`,
      [storeId]
    );
    const flat = await pool.query(
      `SELECT variant_id, leaf_variant_id AS leaf, quantity_per_unit AS quantity
       FROM pos_product_components_flat WHERE store_id = $1
       ORDER BY variant_id, leaf_variant_id`,
      [storeId]
    );
    expect(flat.rows.length).toBeGreaterThan(0);
    expect(flat.rows).toEqual(authored.rows);
  });

  it('never puts a composite inside a composite', async () => {
    const nested = await pool.query(
      `SELECT c.id FROM pos_product_components c
       JOIN pos_variants v ON v.id = c.component_variant_id
       JOIN pos_products p ON p.id = v.product_id
       WHERE c.store_id = $1 AND p.kind = 'composite'`,
      [storeId]
    );
    expect(nested.rows).toEqual([]);
  });

  it('carries the credentials the migration header advertises', async () => {
    // Pasted bcrypt digests rot silently; this is what notices.
    const staff = await pool.query(
      `SELECT role, login, password_hash, pin_hash FROM pos_staff
       WHERE store_id = $1 ORDER BY role`,
      [storeId]
    );
    const owner = staff.rows.find((r) => r.role === 'owner')!;
    const seller = staff.rows.find((r) => r.role === 'seller')!;
    expect(owner.login).toBe('owner@flowers.shop');
    expect(await verifyPassword('owner123', owner.password_hash)).toBe(true);
    expect(await verifyPin('0000', owner.pin_hash)).toBe(true);
    expect(await verifyPin('1234', seller.pin_hash)).toBe(true);
  });

  it('ships no module remote — a dev URL must never reach production', async () => {
    // The store is data and belongs in a migration; the bundle URL is a
    // deployment choice and does not. `npm run pos:seed` writes the localhost
    // entry for local work, and the super admin sets the real one in prod.
    //
    // Comments are stripped first: the header has to name `module_remotes` to
    // explain why a rebuild keeps it. The ban is on writing one.
    const sql = readMigration('039_pos_demo_flowers_store.sql')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toContain('module_remotes');
    expect(sql).not.toContain('localhost');
  });

  it('is idempotent — re-running the migration changes nothing', async () => {
    // Not just the counts: the row ids too. A rebuild that happened to insert
    // the same number of rows would pass a count check and still have thrown
    // the catalogue away.
    const shape = async () =>
      (
        await pool.query(
          `SELECT (SELECT COUNT(*) FROM pos_stores WHERE slug = 'demo-flowers') AS stores,
                  (SELECT COUNT(*) FROM pos_variants WHERE store_id = $1) AS variants,
                  (SELECT COUNT(*) FROM pos_stock_movements WHERE store_id = $1) AS moves,
                  (SELECT md5(string_agg(id::text, ',' ORDER BY id))
                     FROM pos_products WHERE store_id = $1) AS product_ids,
                  (SELECT version FROM pos_demo_seed WHERE slug = 'demo-flowers') AS stamp`,
          [storeId]
        )
      ).rows[0];

    const before = await shape();
    await pool.query(readMigration('039_pos_demo_flowers_store.sql'));
    expect(await shape()).toEqual(before);
    expect(Number(before.stores)).toBe(1);
    expect(Number(before.stamp)).toBeGreaterThan(0);
  });

  it('rebuilds a store that predates the stamp, keeping what its owner set', async () => {
    // The production case this exists for: `demo-flowers` was created by
    // `pos:seed` before the migration owned it, so it carries a catalogue from
    // back then and no stamp at all. The rebuild has to reach it — and must not
    // take the store's configuration with it. `module_remotes` is the one that
    // would hurt: it points at a real `vertical-flowers` release the super
    // admin set, and without it the demo till falls back to the bundled
    // clothing catalogue.
    const url = 'https://cdn.example/test@v9/vertical-flowers/remote-entry.js';
    await pool.query(
      `UPDATE pos_stores
          SET module_remotes = jsonb_build_object(
                'vertical-flowers',
                jsonb_build_object('url', $2::text, 'title', 'Квіти', 'routePath', '/flowers'))
        WHERE id = $1`,
      [storeId, url]
    );
    const staffBefore = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id`,
      [storeId]
    );
    // A demo someone actually sold from: the rebuild deletes this, on purpose.
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
    // An extra product from the old shape, to prove the catalogue is replaced
    // rather than added to.
    await pool.query(
      `INSERT INTO pos_products (store_id, name, kind, stock_mode)
       VALUES ($1, 'Тюльпан (старий сид)', 'simple', 'own')`,
      [storeId]
    );
    await pool.query(`DELETE FROM pos_demo_seed WHERE slug = 'demo-flowers'`);

    await pool.query(readMigration('039_pos_demo_flowers_store.sql'));

    const after = await pool.query(
      `SELECT (SELECT id FROM pos_stores WHERE slug = 'demo-flowers') AS store_id,
              (SELECT module_remotes -> 'vertical-flowers' ->> 'url'
                 FROM pos_stores WHERE id = $1) AS module_url,
              (SELECT COUNT(*) FROM pos_sales WHERE store_id = $1) AS sales,
              (SELECT COUNT(*) FROM pos_products
                WHERE store_id = $1 AND name = 'Тюльпан (старий сид)') AS leftovers,
              (SELECT COUNT(*) FROM pos_stock_documents WHERE store_id = $1) AS docs,
              (SELECT version FROM pos_demo_seed WHERE slug = 'demo-flowers') AS stamp`,
      [storeId]
    );
    expect(Number(after.rows[0].store_id)).toBe(storeId);
    expect(after.rows[0].module_url).toBe(url);
    expect(Number(after.rows[0].sales)).toBe(0);
    expect(Number(after.rows[0].leftovers)).toBe(0);
    expect(Number(after.rows[0].docs)).toBe(2);
    expect(Number(after.rows[0].stamp)).toBeGreaterThan(0);

    // Staff are found, not re-created: nobody's credentials get rotated back.
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
    // The flip side of the rebuild: once a database is at the current version,
    // every boot must keep its hands off. Otherwise whoever is demoing loses
    // their price edit to the next restart.
    await pool.query(
      `UPDATE pos_variants SET price_cents = 99999
        WHERE store_id = $1 AND label = 'Червона · 60 см'`,
      [storeId]
    );
    await pool.query(readMigration('039_pos_demo_flowers_store.sql'));
    const edited = await pool.query(
      `SELECT COUNT(*) AS n FROM pos_variants WHERE store_id = $1 AND price_cents = 99999`,
      [storeId]
    );
    expect(Number(edited.rows[0].n)).toBe(1);

    await pool.query(
      `UPDATE pos_variants SET price_cents = 9000
        WHERE store_id = $1 AND label = 'Червона · 60 см'`,
      [storeId]
    );
  });
});
