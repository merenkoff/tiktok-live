// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.auth.test.ts
//
// Covers auth.routes, staff.routes and telemetry.routes through a real Fastify
// instance. What the route layer owns (and the service tests cannot see): the
// 400/401/403/404 mapping, the fact that `/staff` is owner-only *and* module
// gated, and that a disabled module answers 404 rather than 403 — deliberately
// indistinguishable from a route that does not exist.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { POS_API_VERSION } from '../pos/version.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS auth & staff routes', () => {
  let app: FastifyInstance;
  let store: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rauth');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  describe('POST /auth/owner/login', () => {
    it('returns a session for valid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/owner/login',
        payload: { login: store.ownerLogin, password: store.ownerPassword },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().staff.role).toBe('owner');
      expect(res.json().token).toEqual(expect.any(String));
    });

    it('400s when a field is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/owner/login',
        payload: { login: store.ownerLogin },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('login and password required');
    });

    it('401s on a wrong password without saying which field was wrong', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/owner/login',
        payload: { login: store.ownerLogin, password: 'nope' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid credentials');
    });

    it('401s identically for an unknown login', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/owner/login',
        payload: { login: 'ghost@test.local', password: 'nope' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/staff/pin', () => {
    it('returns a session for the right store slug and PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/staff/pin',
        payload: { store_slug: store.slug, pin: store.sellerPin },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().staff.role).toBe('seller');
    });

    it('400s when store_slug or pin is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/staff/pin',
        payload: { pin: store.sellerPin },
      });
      expect(res.statusCode).toBe(400);
    });

    it('401s on a wrong PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/staff/pin',
        payload: { store_slug: store.slug, pin: '0000' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid PIN or store');
    });
  });

  describe('GET /me', () => {
    it('401s with no Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Unauthorized');
    });

    it('401s on a non-Bearer scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: { authorization: `Basic ${store.ownerToken}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Unauthorized');
    });

    it('401s on an unknown token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth('made-up-token'),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid or expired session');
    });

    it('401s on an expired token', async () => {
      const expired = await issueToken(store.storeId, store.ownerId, { expired: true });
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth(expired),
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns the session payload for a live token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().staff.id).toBe(store.sellerId);
      expect(res.json().store.slug).toBe(store.slug);
    });

    it('stamps the advisory API version on every response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth(store.ownerToken),
      });
      expect(res.headers['x-pos-api-version']).toBe(String(POS_API_VERSION));
    });

    it('still serves a request declaring a stale API version', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: { ...auth(store.ownerToken), 'x-pos-api-version': '0' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('invalidates the token it was called with', async () => {
      const token = await issueToken(store.storeId, store.ownerId);
      const out = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/logout',
        headers: auth(token),
      });
      expect(out.statusCode).toBe(200);
      expect(out.json()).toEqual({ ok: true });

      const after = await app.inject({
        method: 'GET',
        url: '/api/pos/me',
        headers: auth(token),
      });
      expect(after.statusCode).toBe(401);
    });

    it('401s when unauthenticated', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/pos/auth/logout' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('staff routes (owner + `staff` module)', () => {
    it('lists staff for the owner', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/staff',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().map((s: { id: number }) => s.id)).toContain(store.sellerId);
    });

    it('403s for a seller', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/staff',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('Owner access required');
    });

    it('401s when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/staff' });
      expect(res.statusCode).toBe(401);
    });

    it('404s — not 403 — when the store disabled the staff module', async () => {
      const temp = await createTestStore('rstaffoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/staff',
          headers: auth(temp.ownerToken),
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('Not found');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('checks the role before the module gate', async () => {
      // A seller hitting a disabled owner-only module must still see 403:
      // ensureModule runs ensurePosOwner first.
      const temp = await createTestStore('rstafford');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/staff',
          headers: auth(temp.sellerToken),
        });
        expect(res.statusCode).toBe(403);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('creates a seller with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/staff',
        headers: auth(store.ownerToken),
        payload: { display_name: 'Route seller', pin: '135790' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toEqual(expect.any(Number));
    });

    it('400s on a missing field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/staff',
        headers: auth(store.ownerToken),
        payload: { display_name: 'No pin' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('display_name and pin required');
    });

    it('400s and surfaces the service message on a bad PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/staff',
        headers: auth(store.ownerToken),
        payload: { display_name: 'Bad pin', pin: '12' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('PIN must be 4-6 digits');
    });

    it('400s when rotating a PIN on staff from another store', async () => {
      const temp = await createTestStore('rstaffx');
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/staff/${temp.sellerId}/pin`,
          headers: auth(store.ownerToken),
          payload: { pin: '4444' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('Staff not found');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('400s a PATCH without is_active', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/staff/${store.sellerId}`,
        headers: auth(store.ownerToken),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('is_active required');
    });

    it('deactivates a seller through PATCH', async () => {
      const temp = await createTestStore('rpatch');
      try {
        const res = await app.inject({
          method: 'PATCH',
          url: `/api/pos/staff/${temp.sellerId}`,
          headers: auth(temp.ownerToken),
          payload: { is_active: false },
        });
        expect(res.statusCode).toBe(200);

        const sellerNow = await app.inject({
          method: 'GET',
          url: '/api/pos/me',
          headers: auth(temp.sellerToken),
        });
        expect(sellerNow.statusCode).toBe(401);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /client-telemetry', () => {
    it('accepts an unauthenticated beacon with 204', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/client-telemetry',
        payload: {
          sessionId: 'boot-1',
          appVersion: '1.2.3',
          event: { type: 'session_manifest' },
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    });

    it('accepts an empty body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/client-telemetry',
        payload: {},
      });
      expect(res.statusCode).toBe(204);
    });

    it('rejects a body over the 16 KB cap', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/client-telemetry',
        payload: { sessionId: 'x'.repeat(20 * 1024) },
      });
      expect(res.statusCode).toBe(413);
    });
  });
});
