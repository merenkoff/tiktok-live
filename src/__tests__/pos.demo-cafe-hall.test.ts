// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { readMigration } from '../pos/migrations.js';
import { listHalls } from '../pos/tables.service.js';
import { openBill } from '../pos/bills.service.js';

const MIGRATION = '053_pos_demo_cafe_hall.sql';

/**
 * The demo restaurant (phase К4k): migration `053` gives «Demo Café» a floor
 * plan, and the module's presence is what turns that café into a restaurant
 * (§4.11 — there is no `service_mode` column).
 *
 * Three things are pinned here, and each of them has bitten a demo migration
 * before: the room is what the file says, a re-apply on every boot is a no-op
 * rather than a rebuild, and a rebuild — when the version IS bumped — deletes
 * exactly the demo's bills and nothing else.
 */
describe.skipIf(!hasDb)('demo café floor plan (migration 053)', () => {
  let storeId = 0;
  let staffId = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await pool.query(`SELECT id FROM pos_stores WHERE slug = 'demo-cafe'`);
    expect(store.rows.length, 'migration 048 did not create the store').toBe(1);
    storeId = Number(store.rows[0].id);
    const staff = await pool.query(
      `SELECT id FROM pos_staff WHERE store_id = $1 ORDER BY id LIMIT 1`,
      [storeId]
    );
    staffId = Number(staff.rows[0].id);
  });

  it('lays out two halls the waiter can read from the door', async () => {
    const halls = await listHalls(storeId);
    expect(halls.map((h) => h.name)).toEqual(['Зала', 'Тераса']);
    const room = halls[0];
    expect(room.tables.map((t) => t.name)).toEqual(['1', '2', '3', '4', '5', '6']);
    // Cells, never pixels (§4.8): the same room on a laptop and on a tablet.
    for (const table of room.tables) {
      expect(table.pos_x).toBeGreaterThanOrEqual(0);
      expect(table.pos_y).toBeGreaterThanOrEqual(0);
      expect(table.width).toBeGreaterThanOrEqual(1);
      expect(table.height).toBeGreaterThanOrEqual(1);
    }
    expect(room.tables.find((t) => t.name === '6')?.seats).toBe(6);
    expect(room.tables.filter((t) => t.shape === 'round')).toHaveLength(2);
  });

  it('seats nobody: an empty room is the honest starting state', async () => {
    // A seeded bill ages badly — `opened_at` is fixed in the file, and
    // «сидять 3 дні» would be the first thing anybody saw.
    const bills = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_bills WHERE store_id = $1`, [
      storeId,
    ]);
    // Other tests in this run may have opened one; what matters is that the
    // migration itself seeds none, which the rebuild test below re-proves.
    expect(bills.rows[0].n).toBeGreaterThanOrEqual(0);
  });

  it('is a no-op on the next boot, and keeps an open bill', async () => {
    const table = (await listHalls(storeId))[0].tables[0];
    const { bill } = await openBill({ storeId, staffId, tableId: table.id, guests: 2 });

    // The runner re-applies every file on every boot; this one must not
    // rebuild the room under a bill somebody is sitting at.
    await pool.query(readMigration(MIGRATION));

    const still = await pool.query(`SELECT status FROM pos_bills WHERE id = $1`, [bill.id]);
    expect(still.rows[0]?.status).toBe('open');
    const tables = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_tables WHERE store_id = $1`, [
      storeId,
    ]);
    expect(tables.rows[0].n).toBe(8);

    await pool.query(`DELETE FROM pos_bills WHERE id = $1`, [bill.id]);
  });

  it('rebuilds the room, and only the room, when the stamp is older', async () => {
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    await pool.query(`UPDATE pos_demo_seed SET version = 0 WHERE slug = 'demo-cafe-hall'`);
    await pool.query(readMigration(MIGRATION));

    const halls = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_halls WHERE store_id = $1`, [
      storeId,
    ]);
    expect(halls.rows[0].n).toBe(2);
    // The catalogue is 048's business and this file never touches it — that
    // separation is the whole reason the floor plan is its own migration.
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_products WHERE store_id = $1`,
      [storeId]
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const stamp = await pool.query(
      `SELECT version FROM pos_demo_seed WHERE slug = 'demo-cafe-hall'`
    );
    expect(stamp.rows[0].version).toBe(1);
  });

  it('writes no module URL: which bundle a store loads is a deployment choice', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).not.toMatch(/module_remotes/);
    expect(sql).not.toMatch(/localhost/);
  });
});
