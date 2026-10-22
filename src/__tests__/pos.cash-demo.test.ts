// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hasDb } from './helpers/pos-fixtures.js';
import {
  applyAllMigrations,
  canCreateDatabase,
  createScratchDatabase,
  dropScratchDatabase,
} from './helpers/scratch-db.js';
import { readMigration } from '../pos/migrations.js';
import { loginOwner, loginWithPin } from '../pos/auth.service.js';

const MIGRATION = '069_pos_cash_demo_stores.sql';
const PROBE_DB = 'pos_cash_demo_probe';

const PAIRS = [
  { src: 'demo-clothing', dst: 'cash-demo-clothing', login: 'clothing@cash-demo.shop' },
  { src: 'demo-flowers', dst: 'cash-demo-flowers', login: 'flowers@cash-demo.shop' },
  { src: 'demo-cafe', dst: 'cash-demo-cafe', login: 'cafe@cash-demo.shop' },
  { src: 'demo-restaurant', dst: 'cash-demo-restaurant', login: 'restaurant@cash-demo.shop' },
] as const;

const canCreate = hasDb ? await canCreateDatabase() : false;

async function storeId(db: Pool, slug: string): Promise<number> {
  const row = await db.query(`SELECT id FROM pos_stores WHERE slug = $1`, [slug]);
  expect(row.rows.length, `${slug} does not exist`).toBe(1);
  return Number(row.rows[0].id);
}

/** Everything a till sells from, keyed by names rather than ids, so two stores compare. */
async function catalogue(db: Pool, id: number) {
  const q = async (sql: string) => (await db.query(sql, [id])).rows.map((r) => r.k as string).sort();
  return {
    variants: await q(
      `SELECT concat_ws('|', p.name, p.kind, p.stock_mode, p.sellable, v.label, v.unit, v.price_cents,
                        v.cost_cents, v.sku, v.barcode, v.attributes::text) AS k
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND v.is_active AND p.is_active`
    ),
    tags: await q(
      `SELECT concat_ws('|', pr.name, t.name, t.station, t.show_in_catalog_bar) AS k
       FROM pos_tags t LEFT JOIN pos_tags pr ON pr.id = t.parent_id WHERE t.store_id = $1`
    ),
    productTags: await q(
      `SELECT p.name || '|' || t.name AS k
       FROM pos_product_tags pt JOIN pos_products p ON p.id = pt.product_id JOIN pos_tags t ON t.id = pt.tag_id
       WHERE p.store_id = $1`
    ),
    recipes: await q(
      `SELECT concat_ws('|', p.name, v.label, cp.name, cv.label, pc.quantity) AS k
       FROM pos_product_components pc
       JOIN pos_variants v ON v.id = pc.variant_id JOIN pos_products p ON p.id = v.product_id
       JOIN pos_variants cv ON cv.id = pc.component_variant_id JOIN pos_products cp ON cp.id = cv.product_id
       WHERE pc.store_id = $1`
    ),
    flat: await q(
      `SELECT concat_ws('|', p.name, v.label, lp.name, lv.label, f.quantity_per_unit) AS k
       FROM pos_product_components_flat f
       JOIN pos_variants v ON v.id = f.variant_id JOIN pos_products p ON p.id = v.product_id
       JOIN pos_variants lv ON lv.id = f.leaf_variant_id JOIN pos_products lp ON lp.id = lv.product_id
       WHERE f.store_id = $1`
    ),
    modifiers: await q(
      `SELECT concat_ws('|', g.name, g.min_select, g.max_select, m.name, m.price_delta_cents, cp.name, cv.label,
                        m.component_quantity, m.is_default, m.label_deltas::text) AS k
       FROM pos_modifiers m JOIN pos_modifier_groups g ON g.id = m.group_id
       LEFT JOIN pos_variants cv ON cv.id = m.component_variant_id
       LEFT JOIN pos_products cp ON cp.id = cv.product_id
       WHERE m.store_id = $1 AND m.is_active`
    ),
    productGroups: await q(
      `SELECT p.name || '|' || g.name AS k
       FROM pos_product_modifier_groups pmg
       JOIN pos_products p ON p.id = pmg.product_id JOIN pos_modifier_groups g ON g.id = pmg.group_id
       WHERE pmg.store_id = $1`
    ),
    tables: await q(
      `SELECT concat_ws('|', h.name, t.name, t.seats, t.pos_x, t.pos_y, t.width, t.height, t.shape) AS k
       FROM pos_tables t JOIN pos_halls h ON h.id = t.hall_id WHERE t.store_id = $1`
    ),
  };
}

/**
 * Migration `069` gives a reseller four stores of their own to break, copied
 * once from the four demos. What matters is that the copy is a working store
 * (logins, recipes expanded, stock on the shelf), that it is the demo as its
 * migration built it, and that it really is one-time: a later boot neither
 * rebuilds it nor brings back one that was deleted.
 *
 * The copies are compared on a database of this file's own, booted once from
 * nothing: in the shared one the demo suites rebuild their stores with their
 * own migration alone, and a demo caught mid-test has no expanded recipes or
 * kitchen stations (see `helpers/scratch-db.ts`).
 */
describe.skipIf(!hasDb || !canCreate)('cash demo stores (migration 069)', () => {
  let probe: Pool;

  beforeAll(async () => {
    probe = await createScratchDatabase(PROBE_DB);
    await applyAllMigrations(probe);
  }, 180000);

  afterAll(async () => {
    await dropScratchDatabase(PROBE_DB, probe);
    await pool.end();
  });

  it.each(PAIRS)('$dst copies the vertical, catalogue, recipes and floor plan of $src', async ({ src, dst }) => {
    const [from, to] = [await storeId(probe, src), await storeId(probe, dst)];
    const verticals = await probe.query(
      `SELECT vertical, florist_labour_bps FROM pos_stores WHERE id IN ($1, $2) ORDER BY id = $2`,
      [from, to]
    );
    expect(verticals.rows[1]).toEqual(verticals.rows[0]);

    const [a, b] = [await catalogue(probe, from), await catalogue(probe, to)];
    expect(b.variants.length).toBeGreaterThan(10);
    expect(b).toEqual(a);
  });

  // Through the real auth service, on the shared database the global setup
  // migrated: no other suite touches these four stores there.
  it.each(PAIRS)('$dst lets in the owner by PIN 3333 and password, and the seller by PIN 4444', async ({ dst, login }) => {
    const owner = await loginWithPin(dst, '3333');
    expect(owner?.staff.role).toBe('owner');
    expect(owner?.store.slug).toBe(dst);

    const seller = await loginWithPin(dst, '4444');
    expect(seller?.staff.role).toBe('seller');
    expect(seller?.store.slug).toBe(dst);

    const byPassword = await loginOwner(login, 'cash3333');
    expect(byPassword?.store.slug).toBe(dst);

    expect(await loginWithPin(dst, '0000')).toBeNull();
    expect(await loginWithPin(dst, '1234')).toBeNull();
  });

  it.each(PAIRS)('$dst starts with the shelf $src had when its migration built it', async ({ src, dst }) => {
    const [from, to] = [await storeId(probe, src), await storeId(probe, dst)];
    const asMap = (rows: { k: string; qty: number }[]) => Object.fromEntries(rows.map((r) => [r.k, r.qty]));
    // Nothing has been sold here yet, so the source's shelf is still the one its migration left.
    const source = await probe.query(
      `SELECT p.name || '|' || v.label AS k, s.quantity AS qty
       FROM pos_stock s JOIN pos_variants v ON v.id = s.variant_id JOIN pos_products p ON p.id = v.product_id
       WHERE s.store_id = $1 AND v.is_active AND p.is_active`,
      [from]
    );
    const copied = await probe.query(
      `SELECT p.name || '|' || v.label AS k, s.quantity AS qty
       FROM pos_stock s JOIN pos_variants v ON v.id = s.variant_id JOIN pos_products p ON p.id = v.product_id
       WHERE s.store_id = $1`,
      [to]
    );
    expect(Object.keys(asMap(copied.rows)).length).toBeGreaterThan(10);
    expect(asMap(copied.rows)).toEqual(asMap(source.rows));

    // The opening balance is a movement, so the stock report adds up.
    const unbalanced = await probe.query(
      `SELECT s.variant_id FROM pos_stock s
       LEFT JOIN pos_stock_movements m ON m.variant_id = s.variant_id
       WHERE s.store_id = $1 GROUP BY s.variant_id, s.quantity
       HAVING s.quantity <> COALESCE(SUM(m.delta), 0)`,
      [to]
    );
    expect(unbalanced.rows).toEqual([]);
  });

  it('gives the guest menus their own addresses and copies nobody’s secrets', async () => {
    const rows = await probe.query(
      `SELECT slug, public_menu_enabled, public_menu_token, public_menu_secret, gtin_api_key, live_tiktok_username
       FROM pos_stores WHERE slug LIKE 'cash-demo-%' ORDER BY slug`
    );
    const bySlug = Object.fromEntries(rows.rows.map((r) => [r.slug, r]));
    expect(bySlug['cash-demo-cafe'].public_menu_token).toBe('cash-demo-cafe-menu');
    expect(bySlug['cash-demo-restaurant'].public_menu_token).toBe('cash-demo-restaurant-menu');
    expect(bySlug['cash-demo-clothing'].public_menu_token).toBeNull();
    expect(bySlug['cash-demo-flowers'].public_menu_token).toBeNull();
    for (const row of rows.rows) {
      expect(row.public_menu_secret).toBeNull();
      expect(row.gtin_api_key).toBeNull();
      expect(row.live_tiktok_username).toBeNull();
    }
    const keys = await probe.query(
      `SELECT count(*)::int AS n FROM pos_tables t JOIN pos_stores s ON s.id = t.store_id
       WHERE s.slug LIKE 'cash-demo-%' AND t.qr_key IS NOT NULL`
    );
    expect(keys.rows[0].n).toBe(0);
  });

  it('copies the demo as its migration built it, not what a visitor added since', async () => {
    const from = await storeId(probe, 'demo-clothing');
    // A public demo with a known password: someone adds a card and sells a jacket.
    const junk = await probe.query(
      `INSERT INTO pos_products (store_id, name, created_at) VALUES ($1, 'asdf', NOW() + interval '1 minute')
       RETURNING id`,
      [from]
    );
    const sold = await probe.query(
      `SELECT v.id, s.quantity FROM pos_stock s JOIN pos_variants v ON v.id = s.variant_id
       WHERE s.store_id = $1 AND s.quantity > 1 ORDER BY v.id LIMIT 1`,
      [from]
    );
    const { id: variant, quantity } = sold.rows[0];
    await probe.query(
      `INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, created_at)
       VALUES ($1, $2, -1, 'sale', NOW() + interval '1 minute')`,
      [from, variant]
    );
    await probe.query(`UPDATE pos_stock SET quantity = quantity - 1 WHERE variant_id = $1`, [variant]);

    await probe.query(`DELETE FROM pos_stores WHERE slug = 'cash-demo-clothing'`);
    await probe.query(`DELETE FROM pos_demo_seed WHERE slug = 'cash-demo-clothing'`);
    await probe.query(readMigration(MIGRATION));

    const to = await storeId(probe, 'cash-demo-clothing');
    const names = await probe.query(`SELECT name FROM pos_products WHERE store_id = $1`, [to]);
    expect(names.rows.map((r) => r.name)).not.toContain('asdf');
    const shelf = await probe.query(
      `SELECT s.quantity FROM pos_stock s
       JOIN pos_variants v ON v.id = s.variant_id
       JOIN pos_variants o ON o.id = $2 AND o.label = v.label AND o.sku IS NOT DISTINCT FROM v.sku
       WHERE s.store_id = $1`,
      [to, variant]
    );
    expect(shelf.rows).toEqual([{ quantity }]);

    await probe.query(`DELETE FROM pos_products WHERE id = $1`, [junk.rows[0].id]);
  });

  it('is one-time: the next boot changes nothing, and a deleted store stays deleted', async () => {
    const id = await storeId(probe, 'cash-demo-flowers');
    await probe.query(`UPDATE pos_variants SET price_cents = price_cents + 100 WHERE store_id = $1`, [id]);
    const before = await catalogue(probe, id);

    await applyAllMigrations(probe);
    expect(await storeId(probe, 'cash-demo-flowers')).toBe(id);
    expect(await catalogue(probe, id)).toEqual(before);

    await probe.query(`DELETE FROM pos_product_components WHERE store_id = $1`, [id]);
    await probe.query(`DELETE FROM pos_stores WHERE id = $1`, [id]);
    await probe.query(readMigration(MIGRATION));
    const gone = await probe.query(`SELECT 1 FROM pos_stores WHERE slug = 'cash-demo-flowers'`);
    expect(gone.rows).toEqual([]);

    // Only removing the stamp too asks for it again.
    await probe.query(`DELETE FROM pos_demo_seed WHERE slug = 'cash-demo-flowers'`);
    await probe.query(readMigration(MIGRATION));
    const rebuilt = await storeId(probe, 'cash-demo-flowers');
    expect(rebuilt).not.toBe(id);
    expect(await catalogue(probe, rebuilt)).toEqual(await catalogue(probe, await storeId(probe, 'demo-flowers')));
  }, 120000);
});
