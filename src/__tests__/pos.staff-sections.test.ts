// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.staff-sections.test.ts — the till's sections closed per
// staff member (migration 111, TechDocs/POS_STAFF_SECTIONS.md).
//
// What this pins: the owner's list is validated and stored sorted, «Каса» and
// the owner's own row refused; the login and `/me` carry it; every route the
// table names is a real route, answers a closed cashier 403 `section_closed`
// and lets an open one through; no other route ever answers `section_closed`;
// opening a section works on the very next request; the owner is never limited.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  issueToken,
  type TestStore,
} from './helpers/pos-fixtures.js';
import * as authService from '../pos/auth.service.js';
import {
  normalizeBlockedSections,
  SECTION_ROUTES,
  sectionClosed,
  sectionOfRoute,
} from '../pos/core/staffSections.js';

describe('staffSections — pure', () => {
  it('stores module ids once, sorted, and refuses «Каса» and junk in words', () => {
    expect(normalizeBlockedSections(['tiktok-live', 'stocktake', 'tiktok-live'])).toEqual(['stocktake', 'tiktok-live']);
    expect(normalizeBlockedSections([])).toEqual([]);
    expect(() => normalizeBlockedSections(['catalog-checkout'])).toThrow(/Каса/);
    expect(() => normalizeBlockedSections('tiktok-live')).toThrow(/список/);
    expect(() => normalizeBlockedSections(['Ефір!'])).toThrow(/Невідомий/);
  });

  it('reads a route as Fastify registered it, and the provider modules as one «Зміна»', () => {
    expect(sectionOfRoute('POST', '/api/pos/stock/counts')).toBe('stocktake');
    expect(sectionOfRoute('post', '/api/pos/fiscal/shift/open')).toBe('fiscal');
    expect(sectionOfRoute('GET', '/api/pos/catalog')).toBeNull();
    expect(sectionOfRoute('GET', undefined)).toBeNull();
    expect(sectionClosed(['fiscal-cashalot'], 'fiscal')).toBe(true);
    expect(sectionClosed(['fiscal-checkbox'], 'fiscal')).toBe(true);
    expect(sectionClosed(['tiktok-live'], 'fiscal')).toBe(false);
  });
});

describe.skipIf(!hasDb)('POS staff sections', () => {
  let app: FastifyInstance;
  let store: TestStore;

  const call = (method: string, url: string, token: string, payload?: unknown) =>
    app.inject({
      method: method as 'GET',
      url: `/api/pos${url}`,
      headers: auth(token),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  const setSections = (staffId: number, sections: unknown) =>
    call('PATCH', `/staff/${staffId}`, store.ownerToken, { blocked_sections: sections });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('sections');
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  it('the owner closes sections on «Співробітники»; the list and /me carry them', async () => {
    const res = await setSections(store.sellerId, ['tiktok-live', 'stocktake']);
    expect(res.statusCode).toBe(200);
    expect(res.json().blocked_sections).toEqual(['stocktake', 'tiktok-live']);

    const list = (await call('GET', '/staff', store.ownerToken)).json() as Array<Record<string, unknown>>;
    expect(list.find((s) => s.id === store.sellerId)?.blocked_sections).toEqual(['stocktake', 'tiktok-live']);
    expect(list.find((s) => s.id === store.ownerId)?.blocked_sections).toEqual([]);

    const me = (await call('GET', '/me', store.sellerToken)).json();
    expect(me.staff.blocked_sections).toEqual(['stocktake', 'tiktok-live']);
    expect((await call('GET', '/me', store.ownerToken)).json().staff.blocked_sections).toEqual([]);

    await setSections(store.sellerId, []);
  });

  it('refuses «Каса», junk, the owner\'s own row and a seller asking', async () => {
    expect((await setSections(store.sellerId, ['catalog-checkout'])).statusCode).toBe(400);
    expect((await setSections(store.sellerId, 'tiktok-live')).statusCode).toBe(400);
    expect((await setSections(store.ownerId, ['tiktok-live'])).statusCode).toBe(400);
    expect((await setSections(999999999, ['tiktok-live'])).statusCode).toBe(404);
    const bySeller = await call('PATCH', `/staff/${store.sellerId}`, store.sellerToken, { blocked_sections: [] });
    expect(bySeller.statusCode).toBe(403);
  });

  it('a closed section is closed at once, and opened at once, without a new login', async () => {
    await setSections(store.sellerId, ['stocktake']);
    const closed = await call('POST', '/stock/counts', store.sellerToken, {});
    expect(closed.statusCode).toBe(403);
    expect(closed.json()).toMatchObject({ code: 'section_closed', section: 'stocktake' });
    expect(closed.json().error).toMatch(/власник/);

    await setSections(store.sellerId, []);
    const open = await call('POST', '/stock/counts', store.sellerToken, {});
    expect(open.json().code).not.toBe('section_closed');
  });

  it('every route the table names is real, closed for a closed cashier and open for an open one; no other route ever says section_closed', async () => {
    const sweep = Fastify({ logger: false });
    const registered = new Set<string>();
    const routes: Array<{ method: string; url: string }> = [];
    sweep.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        routes.push({ method, url: route.url });
        if (route.url.startsWith('/api/pos/')) registered.add(`${method} ${route.url.slice('/api/pos'.length)}`);
      }
    });
    const { registerPosPlugin } = await import('../pos/pos.plugin.js');
    await registerPosPlugin(sweep);
    await sweep.ready();

    const named = Object.values(SECTION_ROUTES).flat();
    expect(named.filter((route) => !registered.has(route))).toEqual([]);

    // A cashier of its own, so nothing the sweep calls ends the fixture's sessions.
    const seller = await authService.createStaff(store.storeId, { displayName: 'Обхід', pin: '8642' });
    const token = await issueToken(store.storeId, seller.id);
    const send = (method: string, url: string) =>
      sweep.inject({
        method: method as 'GET',
        url: url.replace(/:[A-Za-z_]+/g, '999999999'),
        headers: auth(token),
        ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
      });

    try {
      // Every section closed: each named route refuses with its own section.
      const everything = Object.keys(SECTION_ROUTES).map((s) => (s === 'fiscal' ? 'fiscal-cashalot' : s));
      await authService.setStaffSections(store.storeId, seller.id, everything);
      const missed: string[] = [];
      const leaked: string[] = [];
      for (const { method, url } of routes) {
        if (!url.startsWith('/api/pos/') || url.includes('*')) continue;
        const key = `${method} ${url.slice('/api/pos'.length)}`;
        if (key === 'POST /auth/logout') continue;
        const answer = await send(method, url);
        const closed = answer.statusCode === 403 && answer.json().code === 'section_closed';
        if (named.includes(key) && !closed) missed.push(`${key} → ${answer.statusCode}`);
        if (!named.includes(key) && closed) leaked.push(key);
      }
      expect(missed).toEqual([]);
      expect(leaked).toEqual([]);

      // Nothing closed: no named route says section_closed.
      await authService.setStaffSections(store.storeId, seller.id, []);
      for (const key of named) {
        const [method, path] = key.split(' ');
        const answer = await send(method, `/api/pos${path}`);
        expect(answer.statusCode === 403 && answer.json().code === 'section_closed').toBe(false);
      }
    } finally {
      await sweep.close();
      await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [seller.id]);
    }
  }, 120000);

  it('the owner is never limited, whatever the column holds', async () => {
    await pool.query(`UPDATE pos_staff SET blocked_sections = ARRAY['stocktake'] WHERE id = $1`, [store.ownerId]);
    try {
      const answer = await call('POST', '/stock/counts', store.ownerToken, {});
      expect(answer.json().code).not.toBe('section_closed');
      expect((await call('GET', '/me', store.ownerToken)).json().staff.blocked_sections).toEqual([]);
    } finally {
      await pool.query(`UPDATE pos_staff SET blocked_sections = '{}' WHERE id = $1`, [store.ownerId]);
    }
  });
});
