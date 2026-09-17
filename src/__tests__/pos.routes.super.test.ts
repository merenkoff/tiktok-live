// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.super.test.ts — `/api/pos/super/*`, the cross-store
// admin behind POS_SUPER_PASSWORD (TechDocs/POS_SUPER_ADMIN.md).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { issueSuperToken, resetSuperRateLimiter, SUPER_TOKEN_TTL_MS } from '../pos/core/superAuth.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import {
  applyPosMigrations,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

const PASSWORD = 'correct-horse-battery-staple';
const TIKTOK_ENTRY = {
  url: 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.0.0/tiktok-live/remote-entry.js',
  title: 'Прямий ефір',
  routePath: '/live',
  nav: [{ label: 'Ефір', location: 'cashier-primary', order: 85 }],
  icon: 'Video',
};

const FLOWERS_ENTRY = {
  url: 'https://cdn.jsdelivr.net/gh/o/r@module-vertical-flowers-v2.0.0/vertical-flowers/remote-entry.js',
  title: 'Квіти',
  routePath: '/flowers',
  nav: [{ label: 'Квіти', location: 'cashier-primary', order: 80 }],
  icon: 'Flower2',
};

describe.skipIf(!hasDb)('POS super admin routes', () => {
  let app: FastifyInstance;
  let a: TestStore;
  let b: TestStore;
  let c: TestStore;
  let token = '';
  const superHeaders = () => ({ 'x-pos-super-token': token });

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = PASSWORD;
    await applyPosMigrations();
    app = await buildPosTestApp();
    a = await createTestStore('rsupa');
    b = await createTestStore('rsupb');
    c = await createTestStore('rsupc');
    await pool.query(`UPDATE pos_stores SET module_remotes = $1::jsonb WHERE id = $2`, [
      JSON.stringify({ 'tiktok-live': TIKTOK_ENTRY, returns: 'https://cdn.example.com/returns/remote-entry.js' }),
      a.storeId,
    ]);
    await pool.query(`UPDATE pos_stores SET module_remotes = $1::jsonb WHERE id = $2`, [
      JSON.stringify({ returns: 'https://cdn.example.com/returns/remote-entry.js' }),
      b.storeId,
    ]);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(a?.storeId);
    await dropTestStore(b?.storeId);
    await dropTestStore(c?.storeId);
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  beforeEach(() => resetSuperRateLimiter());

  const login = (password: unknown) =>
    app.inject({ method: 'POST', url: '/api/pos/super/login', payload: { password } });

  describe('login', () => {
    it('503s when POS_SUPER_PASSWORD is not set (or too short)', async () => {
      const saved = process.env.POS_SUPER_PASSWORD;
      try {
        delete process.env.POS_SUPER_PASSWORD;
        expect((await login(PASSWORD)).statusCode).toBe(503);
        process.env.POS_SUPER_PASSWORD = 'short';
        expect((await login('short')).statusCode).toBe(503);
      } finally {
        process.env.POS_SUPER_PASSWORD = saved;
      }
    });

    it('401s a wrong password and locks the IP after five failures', async () => {
      for (let i = 0; i < 5; i += 1) expect((await login('nope')).statusCode).toBe(401);
      const locked = await login(PASSWORD);
      expect(locked.statusCode).toBe(429);
      expect(locked.headers['retry-after']).toBeDefined();
    });

    it('issues a token for the right password', async () => {
      const res = await login(PASSWORD);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { token: string; expires_at: string };
      expect(body.token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
      expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
      token = body.token;
    });
  });

  describe('gate', () => {
    it('401s without the header, with a forged token and with an expired one', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/pos/super/stores' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url: '/api/pos/super/stores', headers: { 'x-pos-super-token': '9999999999999.forged' } })).statusCode
      ).toBe(401);
      const expired = issueSuperToken(Date.now() - SUPER_TOKEN_TTL_MS - 1000)!.token;
      expect(
        (await app.inject({ method: 'GET', url: '/api/pos/super/stores', headers: { 'x-pos-super-token': expired } })).statusCode
      ).toBe(401);
    });

    it('a store session token is not a super token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/super/stores',
        headers: { 'x-pos-super-token': a.ownerToken, authorization: `Bearer ${a.ownerToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /super/stores', () => {
    it('lists every store with its module configuration and fiscal state', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/super/stores', headers: superHeaders() });
      expect(res.statusCode).toBe(200);
      const rows = res.json() as Array<Record<string, unknown>>;
      const rowA = rows.find((r) => r.id === a.storeId)!;
      expect(rowA).toMatchObject({
        slug: a.slug,
        module_remotes: { 'tiktok-live': TIKTOK_ENTRY, returns: 'https://cdn.example.com/returns/remote-entry.js' },
        fiscal: { enabled: false, provider: null },
        staff_count: 2,
        last_sale_at: null,
      });
      expect(Array.isArray(rowA.enabled_modules)).toBe(true);
      expect(rows.some((r) => r.id === c.storeId)).toBe(true);
    });
  });

  describe('PATCH /super/stores/:id', () => {
    it('sanitises like the owner route and returns the fresh row', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${c.storeId}`,
        headers: superHeaders(),
        payload: {
          enabled_modules: ['returns', 'nope', 'catalog-checkout'],
          module_remotes: { returns: 'https://cdn.example.com/r.js', stock: 'http://evil.com/x.js' },
        },
      });
      expect(res.statusCode).toBe(200);
      const row = res.json();
      expect(row.enabled_modules).toEqual(['returns']);
      expect(row.module_remotes).toEqual({ returns: 'https://cdn.example.com/r.js' });
    });

    it('rejects a second fiscal-* remote (400) and an unknown store (404)', async () => {
      await updateFiscalSettings(c.storeId, { provider: 'checkbox' });
      const conflict = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${c.storeId}`,
        headers: superHeaders(),
        payload: {
          module_remotes: {
            'fiscal-checkbox': { url: 'https://cdn.example.com/a/remote-entry.js', title: 'A', routePath: '/fiscal', nav: [{ label: 'A', location: 'cashier-primary', order: 1 }] },
            'fiscal-vchasno': { url: 'https://cdn.example.com/b/remote-entry.js', title: 'B', routePath: '/fiscal-b', nav: [{ label: 'B', location: 'cashier-primary', order: 2 }] },
          },
        },
      });
      expect(conflict.statusCode).toBe(400);
      expect(conflict.json().error).toMatch(/fiscal/);
      const missing = await app.inject({ method: 'PATCH', url: '/api/pos/super/stores/999999999', headers: superHeaders(), payload: { enabled_modules: [] } });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('vertical', () => {
    // Its own store, created here and dropped here. These cases move the
    // vertical column and clear `module_remotes`, and the shared a/b/c
    // fixtures are what the repoint cases below assert against — an earlier
    // version of this block wiped store b's `returns` override and made that
    // suite fail three describes later.
    let v: TestStore;

    beforeAll(async () => {
      v = await createTestStore('rsupvert');
    }, 60000);

    afterAll(async () => {
      await dropTestStore(v?.storeId);
    });

    it('reports every store as clothing until told otherwise', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/super/stores', headers: superHeaders() });
      const rows = res.json() as Array<Record<string, unknown>>;
      expect(rows.find((r) => r.id === v.storeId)!.vertical).toBe('clothing');
    });

    it('sets the store vertical and reports it back', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'flowers' },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { vertical: string }).vertical).toBe('flowers');
      const db = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [v.storeId]);
      expect(db.rows[0].vertical).toBe('flowers');
    });

    it('400s an unknown vertical without touching the row', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'cafe' },
      });
      expect(res.statusCode).toBe(400);
      const db = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [v.storeId]);
      expect(db.rows[0].vertical).toBe('flowers');
    });

    it('accepts the vertical and its module in one body', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'flowers', module_remotes: { 'vertical-flowers': FLOWERS_ENTRY } },
      });
      expect(res.statusCode).toBe(200);
      const row = res.json() as { vertical: string; module_remotes: Record<string, unknown> };
      expect(row.vertical).toBe('flowers');
      expect(row.module_remotes['vertical-flowers']).toMatchObject({ routePath: '/flowers' });
    });

    it('400s a vertical module that disagrees with the column, in either order', async () => {
      // Registering the module on a clothing store — its own throwaway store,
      // so a rejected write cannot be confused with one that damaged a fixture.
      const clothing = await createTestStore('rsupvertc');
      try {
        const onClothing = await app.inject({
          method: 'PATCH',
          url: `/api/pos/super/stores/${clothing.storeId}`,
          headers: superHeaders(),
          payload: { module_remotes: { 'vertical-flowers': FLOWERS_ENTRY } },
        });
        expect(onClothing.statusCode).toBe(400);
      } finally {
        await dropTestStore(clothing.storeId);
      }

      // ...and moving the column back while the module is still registered.
      // Both leave the store exactly as it was.
      const backToClothing = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'clothing' },
      });
      expect(backToClothing.statusCode).toBe(400);
      const db = await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [v.storeId]);
      expect(db.rows[0].vertical).toBe('flowers');
    });

    it('relabels every variant when the vertical changes, keeping the attributes', async () => {
      const product = await pool.query(
        `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Троянда') RETURNING id`,
        [v.storeId]
      );
      // A florist's stem, entered while the store was still on flowers.
      await pool.query(
        `INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents)
         VALUES ($1, $2, '{"color":"Червона","length_cm":60}'::jsonb, 'Червона · 60 см', 'шт', 5000)`,
        [v.storeId, product.rows[0].id]
      );

      // Dropping the module is what lets the column move.
      const toClothing = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'clothing', module_remotes: {} },
      });
      expect(toClothing.statusCode).toBe(200);
      expect((toClothing.json() as { vertical: string }).vertical).toBe('clothing');

      const afterClothing = await pool.query(
        `SELECT attributes, label FROM pos_variants WHERE store_id = $1`,
        [v.storeId]
      );
      // Clothing's rule knows `color` and not `length_cm`, so the caption
      // shrinks — but the bag is untouched, which is what lets the move back
      // restore the original caption verbatim.
      expect(afterClothing.rows[0].attributes).toEqual({ color: 'Червона', length_cm: 60 });
      expect(afterClothing.rows[0].label).toBe('Червона');

      const backToFlowers = await app.inject({
        method: 'PATCH',
        url: `/api/pos/super/stores/${v.storeId}`,
        headers: superHeaders(),
        payload: { vertical: 'flowers' },
      });
      expect(backToFlowers.statusCode).toBe(200);
      const afterFlowers = await pool.query(
        `SELECT label FROM pos_variants WHERE store_id = $1`,
        [v.storeId]
      );
      expect(afterFlowers.rows[0].label).toBe('Червона · 60 см');
    });
  });

  describe('POST /super/module-remotes/repoint', () => {
    const NEW_URL = 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.2.0/tiktok-live/remote-entry.js';

    it('replaces the URL where the module exists, keeps the presentation, skips the rest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/super/module-remotes/repoint',
        headers: superHeaders(),
        payload: { module_id: 'tiktok-live', url: NEW_URL },
      });
      expect(res.statusCode).toBe(200);
      const report = res.json();
      expect(report.updated.map((s: { id: number }) => s.id)).toEqual([a.storeId]);
      expect(report.skipped.map((s: { id: number }) => s.id)).toEqual(expect.arrayContaining([b.storeId, c.storeId]));
      expect(report.failed).toEqual([]);
      const stored = await pool.query(`SELECT module_remotes FROM pos_stores WHERE id = $1`, [a.storeId]);
      expect(stored.rows[0].module_remotes['tiktok-live']).toEqual({ ...TIKTOK_ENTRY, url: NEW_URL });
      expect(stored.rows[0].module_remotes.returns).toBe('https://cdn.example.com/returns/remote-entry.js');
    });

    it('honours store_ids for a string override', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/super/module-remotes/repoint',
        headers: superHeaders(),
        payload: { module_id: 'returns', url: 'https://cdn.example.com/returns-v2/remote-entry.js', store_ids: [b.storeId] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated.map((s: { id: number }) => s.id)).toEqual([b.storeId]);
      const [ra, rb] = await Promise.all([
        pool.query(`SELECT module_remotes FROM pos_stores WHERE id = $1`, [a.storeId]),
        pool.query(`SELECT module_remotes FROM pos_stores WHERE id = $1`, [b.storeId]),
      ]);
      expect(ra.rows[0].module_remotes.returns).toBe('https://cdn.example.com/returns/remote-entry.js');
      expect(rb.rows[0].module_remotes.returns).toBe('https://cdn.example.com/returns-v2/remote-entry.js');
    });

    it('reports a store whose entry validation rejects, and 400s bad input', async () => {
      // A string entry under an id that is not a toggleable module cannot pass
      // `sanitizeModuleRemotes` — planted directly to simulate a stale row.
      await pool.query(`UPDATE pos_stores SET module_remotes = $1::jsonb WHERE id = $2`, [
        JSON.stringify({ nope: 'https://cdn.example.com/nope/remote-entry.js' }),
        c.storeId,
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/super/module-remotes/repoint',
        headers: superHeaders(),
        payload: { module_id: 'nope', url: 'https://cdn.example.com/nope-v2/remote-entry.js', store_ids: [c.storeId] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().failed).toEqual([{ id: c.storeId, slug: c.slug, error: 'entry rejected by validation' }]);

      const bad = await app.inject({
        method: 'POST',
        url: '/api/pos/super/module-remotes/repoint',
        headers: superHeaders(),
        payload: { module_id: 'tiktok-live', url: 'http://evil.com/x.js' },
      });
      expect(bad.statusCode).toBe(400);
    });
  });
});
