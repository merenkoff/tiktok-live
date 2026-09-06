// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.store.test.ts
//
// store.routes + analytics.routes + qr.routes + gtin.routes.
//
// PATCH /store is the store owner's settings surface and the only place the
// module set and the module-remote map can be written, so its validation is
// covered closely — a bad remote URL landing in `module_remotes` would be a
// script-injection vector for every web cashier of that store.
//
// The QR and GTIN suites stay on the near side of the network: every assertion
// here is about a request that is rejected *before* the outbound provider call.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { DEFAULT_ENABLED_MODULES } from '../pos/core/modules.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS store, analytics, QR & GTIN routes', () => {
  let app: FastifyInstance;
  let store: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rstore');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  describe('GET /store', () => {
    it('is readable by a seller', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/store',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(store.storeId);
    });

    it('401s without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/store' });
      expect(res.statusCode).toBe(401);
    });

    it('never exposes the raw GTIN API key', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { gtin_api_key: 'super-secret-key' },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
      });
      expect(JSON.stringify(res.json())).not.toContain('super-secret-key');
      expect(res.json().gtin_api_key_set).toBe(true);
    });
  });

  describe('PATCH /store', () => {
    it('403s a seller', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.sellerToken),
        payload: { name: 'Renamed by seller' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('is reachable even with every module disabled — settings is core', async () => {
      const temp = await createTestStore('rstorecore');
      try {
        await setEnabledModules(temp.storeId, []);
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/pos/store',
          headers: auth(temp.ownerToken),
          payload: { name: 'Still editable' },
        });
        expect(res.statusCode).toBe(200);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('400s a blank name', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { name: '   ' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('name required');
    });

    it('400s an unknown qr_payment_mode', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { qr_payment_mode: 'magic' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('qr_payment_mode must be static or dynamic');
    });

    it.each([0, -1, 1.5, 'ten'])('400s gtin_daily_limit %j', async (value) => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { gtin_daily_limit: value },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('gtin_daily_limit must be a positive integer');
    });

    it('clears the GTIN key on an explicit null', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { gtin_api_key: 'k-to-clear' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { gtin_api_key: null },
      });
      expect(res.json().gtin_api_key_set).toBe(false);
    });

    describe('enabled_modules', () => {
      it('400s a non-array', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/pos/store',
          headers: auth(store.ownerToken),
          payload: { enabled_modules: 'products' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('enabled_modules must be an array');
      });

      it('drops unknown and core ids, keeping only toggleable ones', async () => {
        const temp = await createTestStore('rmodsan');
        try {
          const res = await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: {
              enabled_modules: ['products', 'settings', 'not-a-module', 'stock', 'products', 7],
            },
          });
          expect(res.statusCode).toBe(200);
          expect(res.json().enabled_modules).toEqual(['products', 'stock']);
        } finally {
          await dropTestStore(temp.storeId);
        }
      });

      it('takes effect immediately on the next request', async () => {
        const temp = await createTestStore('rmodlive');
        try {
          expect(
            (
              await app.inject({
                method: 'GET',
                url: '/api/pos/staff',
                headers: auth(temp.ownerToken),
              })
            ).statusCode
          ).toBe(200);

          await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: { enabled_modules: ['products'] },
          });

          expect(
            (
              await app.inject({
                method: 'GET',
                url: '/api/pos/staff',
                headers: auth(temp.ownerToken),
              })
            ).statusCode
          ).toBe(404);
        } finally {
          await dropTestStore(temp.storeId);
        }
      });

      it('an empty array falls back to the defaults on the session payload', async () => {
        const temp = await createTestStore('rmodempty');
        try {
          await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: { enabled_modules: [] },
          });
          const me = await app.inject({
            method: 'GET',
            url: '/api/pos/me',
            headers: auth(temp.ownerToken),
          });
          expect(me.json().store.enabled_modules).toEqual([...DEFAULT_ENABLED_MODULES]);
        } finally {
          await dropTestStore(temp.storeId);
        }
      });
    });

    describe('module_remotes', () => {
      it('400s a non-object', async () => {
        for (const bad of [['a'], null, 'x']) {
          const res = await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(store.ownerToken),
            payload: { module_remotes: bad },
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().error).toBe('module_remotes must be an object');
        }
      });

      it('accepts https, root-relative and localhost URLs', async () => {
        const temp = await createTestStore('rrem');
        try {
          const res = await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: {
              module_remotes: {
                products: 'https://cdn.example.com/products/remote-entry.js',
                stock: '/modules/stock/remote-entry.js',
                analytics: 'http://localhost:5173/analytics/remote-entry.js',
              },
            },
          });
          expect(res.statusCode).toBe(200);
          expect(res.json().module_remotes).toEqual({
            products: 'https://cdn.example.com/products/remote-entry.js',
            stock: '/modules/stock/remote-entry.js',
            analytics: 'http://localhost:5173/analytics/remote-entry.js',
          });
        } finally {
          await dropTestStore(temp.storeId);
        }
      });

      it.each([
        ['plain http', 'http://evil.example.com/remote-entry.js'],
        ['protocol-relative', '//evil.example.com/remote-entry.js'],
        ['data URI', 'data:text/javascript,alert(1)'],
        ['javascript URI', 'javascript:alert(1)'],
        ['junk', 'not-a-url'],
      ])('silently drops a %s remote', async (_label, url) => {
        const temp = await createTestStore('rremdrop');
        try {
          const res = await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: { module_remotes: { products: url } },
          });
          expect(res.statusCode).toBe(200);
          expect(res.json().module_remotes).toEqual({});
        } finally {
          await dropTestStore(temp.storeId);
        }
      });

      it('drops a remote pointed at a core module id', async () => {
        const temp = await createTestStore('rremcore');
        try {
          const res = await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: { module_remotes: { settings: 'https://cdn.example.com/x.js' } },
          });
          expect(res.json().module_remotes).toEqual({});
        } finally {
          await dropTestStore(temp.storeId);
        }
      });

      it('surfaces the stored remotes on the session payload', async () => {
        const temp = await createTestStore('rremme');
        try {
          await app.inject({
            method: 'PATCH',
            url: '/api/pos/store',
            headers: auth(temp.ownerToken),
            payload: { module_remotes: { stock: 'https://cdn.example.com/stock.js' } },
          });
          const me = await app.inject({
            method: 'GET',
            url: '/api/pos/me',
            headers: auth(temp.ownerToken),
          });
          expect(me.json().store.module_remotes).toEqual({
            stock: 'https://cdn.example.com/stock.js',
          });
        } finally {
          await dropTestStore(temp.storeId);
        }
      });
    });
  });

  describe('GET /analytics/summary', () => {
    it('serves a summary for a seller', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/summary',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
    });

    it.each([
      ['from', '/api/pos/analytics/summary?from=01-01-2026', 'from must be YYYY-MM-DD'],
      ['to', '/api/pos/analytics/summary?to=2026/01/01', 'to must be YYYY-MM-DD'],
    ])('400s a malformed %s', async (_label, url, message) => {
      const res = await app.inject({ method: 'GET', url, headers: auth(store.ownerToken) });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe(message);
    });

    it('400s an inverted range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/summary?from=2026-06-01&to=2026-01-01',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('from must be <= to');
    });

    it('400s a range wider than 366 days', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/summary?from=2024-01-01&to=2026-01-01',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('range too large (max 366 days)');
    });

    it('accepts a range of exactly 366 days', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/summary?from=2024-01-01&to=2024-12-31',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
    });

    it('404s when the analytics module is off', async () => {
      const temp = await createTestStore('ranaoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/analytics/summary',
          headers: auth(temp.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /qr/invoice', () => {
    it('400s a non-positive or non-integer amount before touching the provider', async () => {
      for (const amount_cents of [0, -100, 12.5, 'x', undefined]) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/qr/invoice',
          headers: auth(store.sellerToken),
          payload: { amount_cents },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('amount_cents must be a positive integer');
      }
    });

    it('400s when the store has not enabled dynamic QR', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/qr/invoice',
        headers: auth(store.sellerToken),
        payload: { amount_cents: 10000 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('dynamic QR payment is not enabled for this store');
    });

    it('400s when QR is enabled but still in static mode', async () => {
      const temp = await createTestStore('rqrstatic');
      try {
        await app.inject({
          method: 'PATCH',
          url: '/api/pos/store',
          headers: auth(temp.ownerToken),
          payload: { qr_payment_enabled: true, qr_payment_mode: 'static' },
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/qr/invoice',
          headers: auth(temp.sellerToken),
          payload: { amount_cents: 10000 },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('dynamic QR payment is not enabled for this store');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('401s without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/qr/invoice',
        payload: { amount_cents: 100 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('404s when the qr-payment module is off', async () => {
      const temp = await createTestStore('rqroff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/qr/invoice',
          headers: auth(temp.sellerToken),
          payload: { amount_cents: 10000 },
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /qr/webhook', () => {
    const body = { invoice_id: 'inv-1', status: 'paid' };

    it('401s an unsigned callback', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/qr/webhook',
        payload: body,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('bad signature');
    });

    it('401s a wrong signature', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/qr/webhook',
        headers: { signature: 'deadbeef' },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    });

    it('401s a signature computed with the wrong key', async () => {
      const raw = JSON.stringify(body);
      const wrong = crypto.createHmac('sha256', 'not-the-key').update(raw).digest('hex');
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/qr/webhook',
        headers: { signature: wrong, 'content-type': 'application/json' },
        payload: raw,
      });
      expect(res.statusCode).toBe(401);
    });

    it.skipIf(!process.env.OPENDATABOT_QR_KEY)(
      'accepts a correctly signed callback without a session',
      async () => {
        const raw = JSON.stringify(body);
        const signature = crypto
          .createHmac('sha256', process.env.OPENDATABOT_QR_KEY!.trim())
          .update(raw)
          .digest('hex');
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/qr/webhook',
          headers: { signature, 'content-type': 'application/json' },
          payload: raw,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().ok).toBe(true);
      }
    );
  });

  describe('GTIN routes', () => {
    it('403s a seller — the whole surface is owner-only', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/gtin/learn/stats',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('401s without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/gtin/learn/stats' });
      expect(res.statusCode).toBe(401);
    });

    it('404s when the gtin-enrichment module is off', async () => {
      const temp = await createTestStore('rgtinoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/gtin/learn/stats',
          headers: auth(temp.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('403s when the module is on but the store turned lookups off', async () => {
      const temp = await createTestStore('rgtindis');
      try {
        await app.inject({
          method: 'PATCH',
          url: '/api/pos/store',
          headers: auth(temp.ownerToken),
          payload: { gtin_lookup_enabled: false },
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/gtin/learn/batch',
          headers: auth(temp.ownerToken),
          payload: { items: [] },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('gtin lookup disabled');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });
});
