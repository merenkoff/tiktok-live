// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.printer-profiles.test.ts — shared printer profiles
// (TechDocs/POS_PRINTER_PROFILES.md): a till reports the profile its owner
// picked, the super admin approves one per driver under a title, every till
// reads the approved list.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { normalizeDriver, parseProfile } from '../pos/printer-profiles.service.js';
import { resetSuperRateLimiter } from '../pos/core/superAuth.js';

const PASSWORD = 'printer-profiles-super-password-1';

describe('printer profiles — parsing', () => {
  it('reads the driver name and fills in the standard table number', () => {
    expect(normalizeDriver('  XP-58   (copy 1) ')).toBe('XP-58 (copy 1)');
    expect(normalizeDriver('')).toBeNull();
    expect(normalizeDriver('x'.repeat(121))).toBeNull();
    expect(normalizeDriver(42)).toBeNull();
    expect(parseProfile({ driver: 'XP-58', table: 'windows1251', esc_t: null })).toEqual({
      driver: 'XP-58',
      table: 'windows1251',
      esc_t: 46,
    });
    expect(parseProfile({ driver: 'XP-58', table: 'cp866' }).esc_t).toBe(17);
    expect(parseProfile({ driver: 'XP-58', table: 'cp866', esc_t: 7 }).esc_t).toBe(7);
    expect(() => parseProfile({ driver: 'XP-58', table: 'utf8' })).toThrow(/таблиця/);
    expect(() => parseProfile({ driver: 'XP-58', table: 'cp866', esc_t: 256 })).toThrow(/ESC t/);
    expect(() => parseProfile({ table: 'cp866' })).toThrow(/драйвера/);
  });
});

describe.skipIf(!hasDb)('printer profiles — report, approve, share', () => {
  let app: FastifyInstance;
  let shop: TestStore;
  let other: TestStore;
  let superToken = '';
  const DRIVER = `XP-58 test ${Date.now()}`;

  const report = (store: TestStore, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/pos/printer-profiles/report', headers: auth(store.ownerToken), payload });
  const superGet = () =>
    app.inject({ method: 'GET', url: '/api/pos/super/printer-profiles', headers: { 'x-pos-super-token': superToken } });
  const shared = async (store: TestStore) => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/printer-profiles', headers: auth(store.ownerToken) });
    expect(res.statusCode).toBe(200);
    return (res.json().profiles as Array<{ driver: string }>).filter((p) => p.driver === DRIVER);
  };

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = PASSWORD;
    await applyPosMigrations();
    app = await buildPosTestApp();
    shop = await createTestStore('prof');
    other = await createTestStore('prof2');
    resetSuperRateLimiter();
    const login = await app.inject({ method: 'POST', url: '/api/pos/super/login', payload: { password: PASSWORD } });
    superToken = login.json().token;
  }, 60000);

  afterAll(async () => {
    await pool.query(`DELETE FROM pos_printer_profiles WHERE driver = $1`, [DRIVER]);
    await dropTestStore(shop?.storeId);
    await dropTestStore(other?.storeId);
    await app?.close();
  });

  it('needs a store session to report or read', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/pos/printer-profiles/report', payload: { driver: DRIVER, table: 'cp866' } });
    expect(res.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/pos/printer-profiles' })).statusCode).toBe(401);
  });

  it('refuses a bad report in words', async () => {
    const res = await report(shop, { driver: DRIVER, table: 'koi8' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/таблиця/);
  });

  it('keeps one row per store and profile, raising the count', async () => {
    expect((await report(shop, { driver: DRIVER, table: 'cp866', esc_t: null, prints: 3, paper_width_mm: 58 })).statusCode).toBe(200);
    // The same profile spelled with its standard number is the same row.
    expect((await report(shop, { driver: DRIVER, table: 'cp866', esc_t: 17, prints: 2 })).statusCode).toBe(200);
    expect((await report(other, { driver: DRIVER, table: 'windows1251', esc_t: 46, prints: 5 })).statusCode).toBe(200);

    const { reports } = (await superGet()).json();
    const mine = reports.filter((r: { driver: string }) => r.driver === DRIVER);
    expect(mine).toHaveLength(2);
    const fromShop = mine.find((r: { store_id: number }) => r.store_id === shop.storeId);
    expect(fromShop).toMatchObject({ table: 'cp866', esc_t: 17, prints: 3, paper_width_mm: 58, approved: false });
    expect(fromShop.store_code).toBe((await pool.query(`SELECT slug FROM pos_stores WHERE id = $1`, [shop.storeId])).rows[0].slug);
  });

  it('the super admin approves one profile per driver, renames it, and every till reads it', async () => {
    expect(await shared(other)).toEqual([]);
    const { reports } = (await superGet()).json();
    const fromShop = reports.find((r: { driver: string; store_id: number }) => r.driver === DRIVER && r.store_id === shop.storeId);
    const fromOther = reports.find((r: { driver: string; store_id: number }) => r.driver === DRIVER && r.store_id === other.storeId);

    const noTitle = await app.inject({
      method: 'POST',
      url: `/api/pos/super/printer-profiles/reports/${fromShop.id}/approve`,
      headers: { 'x-pos-super-token': superToken },
      payload: { title: '  ' },
    });
    expect(noTitle.statusCode).toBe(400);

    const approved = await app.inject({
      method: 'POST',
      url: `/api/pos/super/printer-profiles/reports/${fromShop.id}/approve`,
      headers: { 'x-pos-super-token': superToken },
      payload: { title: 'Xprinter XP-58IIH' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ driver: DRIVER, title: 'Xprinter XP-58IIH', table: 'cp866', esc_t: 17, source_store_id: shop.storeId });
    expect(await shared(other)).toEqual([{ driver: DRIVER, title: 'Xprinter XP-58IIH', table: 'cp866', esc_t: 17 }]);

    // Approving another report for the same driver replaces it.
    const again = await app.inject({
      method: 'POST',
      url: `/api/pos/super/printer-profiles/reports/${fromOther.id}/approve`,
      headers: { 'x-pos-super-token': superToken },
      payload: { title: 'XP-58' },
    });
    expect(again.json()).toMatchObject({ table: 'windows1251', esc_t: 46, source_store_id: other.storeId });
    expect(again.json().id).toBe(approved.json().id);
    const after = (await superGet()).json();
    expect(after.reports.filter((r: { driver: string; approved: boolean }) => r.driver === DRIVER && r.approved)).toHaveLength(1);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/pos/super/printer-profiles/${again.json().id}`,
      headers: { 'x-pos-super-token': superToken },
      payload: { title: 'Xprinter XP-58 (без китайського режиму)' },
    });
    expect(renamed.json().title).toBe('Xprinter XP-58 (без китайського режиму)');
    expect((await shared(shop))[0].title).toBe('Xprinter XP-58 (без китайського режиму)');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/pos/super/printer-profiles/${again.json().id}`,
      headers: { 'x-pos-super-token': superToken },
    });
    expect(removed.statusCode).toBe(200);
    expect(await shared(shop)).toEqual([]);
    // The reports stay: the super admin can approve again.
    expect((await superGet()).json().reports.filter((r: { driver: string }) => r.driver === DRIVER)).toHaveLength(2);
  });

  it('caps how many different profiles one store may report', async () => {
    const flood = await createTestStore('prof3');
    try {
      for (let n = 0; n < 50; n++) {
        await pool.query(
          `INSERT INTO pos_printer_profile_reports (store_id, driver, enc_table, esc_t) VALUES ($1, $2, 'cp866', 17)`,
          [flood.storeId, `flood-${n}`]
        );
      }
      const more = await report(flood, { driver: 'flood-new', table: 'cp866' });
      expect(more.statusCode).toBe(429);
      // A profile it already reported still counts up.
      expect((await report(flood, { driver: 'flood-3', table: 'cp866', prints: 9 })).statusCode).toBe(200);
    } finally {
      await dropTestStore(flood.storeId);
    }
  });

  it('the super routes need the super token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/super/printer-profiles', headers: auth(shop.ownerToken) });
    expect(res.statusCode).toBe(401);
  });
});
