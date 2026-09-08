// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.gtin.test.ts
//
// The owner's repair surface over `pos_gtin_cache`. That table is shared by
// every store, so a wrong name in it is wrong for all of them — these routes
// are the only way to correct or retract one, and the only routes that may
// write a tombstone. Auth, the module gate and the store's lookup flag are
// covered alongside the behaviour, because a seller reaching any of this would
// be editing other stores' data.
//
// The learn/stats side of gtin.routes stays covered in pos.routes.store.test.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  clearGtinCache,
  createTestStore,
  dropTestStore,
  hasDb,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { getGtinCache, ingestGtinResults } from '../pos/gtin/gtin-cache.service.js';
import { computeCheckDigit } from '../pos/gtin/normalize.js';

function ean(body12: string): string {
  return `${body12}${computeCheckDigit(body12)}`;
}

describe.skipIf(!hasDb)('POS GTIN cache admin routes', () => {
  let app: FastifyInstance;
  let store: TestStore;
  // Own barcode range — every GTIN suite writes to the same shared table.
  const codes = ['484000000001', '484000000002', '484000000003', '484000000004'].map(ean);
  const [fixCode, blockCode, listCode, unblockCode] = codes as [string, string, string, string];

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rgtincache');
    app = await buildPosTestApp();
    await clearGtinCache(...codes);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await clearGtinCache(...codes);
    await pool.end();
  });

  describe('access', () => {
    it('401s without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/gtin/cache' });
      expect(res.statusCode).toBe(401);
    });

    it('403s a seller — the cache is shared across stores', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/gtin/cache',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('404s when the gtin-enrichment module is off', async () => {
      const temp = await createTestStore('rgtincoff');
      try {
        await setEnabledModules(temp.storeId, ['settings']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/gtin/cache',
          headers: auth(temp.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('403s when the store turned lookup off', async () => {
      const temp = await createTestStore('rgtincdis');
      try {
        await app.inject({
          method: 'PATCH',
          url: '/api/pos/store',
          headers: auth(temp.ownerToken),
          payload: { gtin_lookup_enabled: false },
        });
        const res = await app.inject({
          method: 'DELETE',
          url: `/api/pos/gtin/${blockCode}`,
          headers: auth(temp.ownerToken),
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('gtin lookup disabled');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('PATCH /gtin/:code', () => {
    it('writes the correction as manual, so a later lookup cannot undo it', async () => {
      await clearGtinCache(fixCode);
      await ingestGtinResults({
        code: fixCode,
        results: [{ source: 'open_food_facts', found: true, name: 'Помилкова назва' }],
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/gtin/${fixCode}`,
        headers: auth(store.ownerToken),
        payload: { name: 'Правильна назва', brand: 'Бренд' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().hint).toMatchObject({
        name: 'Правильна назва',
        brand: 'Бренд',
        best_source: 'manual',
      });

      await ingestGtinResults({
        code: fixCode,
        results: [{ source: 'open_products_facts', found: true, name: 'Знову помилкова' }],
      });
      expect((await getGtinCache(fixCode))?.name).toBe('Правильна назва');
    });

    it('400s without a name or an explicit unblock', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/gtin/${fixCode}`,
        headers: auth(store.ownerToken),
        payload: { brand: 'Тільки бренд' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400s on a barcode that is not a GTIN', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/gtin/not-a-barcode',
        headers: auth(store.ownerToken),
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /gtin/:code', () => {
    it('leaves a tombstone that automatic sources cannot refill', async () => {
      await clearGtinCache(blockCode);
      await ingestGtinResults({
        code: blockCode,
        results: [{ source: 'open_products_facts', found: true, name: 'Погана назва' }],
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/gtin/${blockCode}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().hint).toMatchObject({ name: null, blocked: true });

      // The very source that put the wrong name there tries again.
      await ingestGtinResults({
        code: blockCode,
        results: [{ source: 'open_products_facts', found: true, name: 'Погана назва' }],
      });
      const after = await getGtinCache(blockCode);
      expect(after?.name).toBeNull();
      expect(after?.blocked).toBe(true);
    });

    it('answers the scan flow with 200 + blocked, not 404', async () => {
      // 404 would send the client off to Open*Facts and spend provider quota on
      // a code the owner already rejected.
      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/gtin/${blockCode}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ found: false, blocked: true });
    });

    it('accepts a code that was never in the cache', async () => {
      await clearGtinCache(unblockCode);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/gtin/${unblockCode}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().hint.blocked).toBe(true);
    });
  });

  describe('unblocking', () => {
    it('lifts the block on blocked:false and lets sources fill it again', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/gtin/${unblockCode}`,
        headers: auth(store.ownerToken),
        payload: { blocked: false },
      });
      expect(res.statusCode).toBe(200);
      // The tombstone held no data, so unblocking returns the code to "not in
      // the cache" rather than leaving a blank row at the top of the list.
      expect(res.json().hint).toBeNull();
      expect(await getGtinCache(unblockCode)).toBeNull();

      await ingestGtinResults({
        code: unblockCode,
        results: [{ source: 'open_products_facts', found: true, name: 'Знову з мережі' }],
      });
      expect((await getGtinCache(unblockCode))?.name).toBe('Знову з мережі');
    });

    it('lifts the block implicitly when a name is supplied', async () => {
      await app.inject({
        method: 'DELETE',
        url: `/api/pos/gtin/${blockCode}`,
        headers: auth(store.ownerToken),
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/gtin/${blockCode}`,
        headers: auth(store.ownerToken),
        payload: { name: 'Виправлено власником' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().hint).toMatchObject({
        name: 'Виправлено власником',
        blocked: false,
        best_source: 'manual',
      });
    });
  });

  describe('GET /gtin/cache', () => {
    it('finds an entry by its barcode in any representation', async () => {
      await clearGtinCache(listCode);
      await ingestGtinResults({
        code: listCode,
        results: [{ source: 'upc_dev', found: true, name: 'Шуканий товар', brand: 'Марка' }],
      });

      for (const query of [listCode, `0${listCode}`]) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/pos/gtin/cache?q=${query}`,
          headers: auth(store.ownerToken),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().items).toHaveLength(1);
        expect(res.json().items[0].name).toBe('Шуканий товар');
      }
    });

    it('finds an entry by name and paginates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/gtin/cache?q=Шуканий&limit=1',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.limit).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.items.length).toBeLessThanOrEqual(1);
    });

    it('lists only tombstones on blocked=1', async () => {
      await app.inject({
        method: 'DELETE',
        url: `/api/pos/gtin/${listCode}`,
        headers: auth(store.ownerToken),
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/gtin/cache?q=${listCode}&blocked=1`,
        headers: auth(store.ownerToken),
      });
      expect(res.json().items).toHaveLength(1);
      expect(res.json().items[0].blocked).toBe(true);
    });
  });
});
