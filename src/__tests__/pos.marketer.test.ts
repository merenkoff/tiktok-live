// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.marketer.test.ts
//
// The «Маркетолог» role (track МР, phase МР1, TechDocs/POS_MARKETER_ROLE.md).
// A café's marketer keeps the menu, the halls and the QR menu and reaches
// nothing else: DENIED BY DEFAULT, every route it needs opening itself. The
// sweep below walks every route the POS plugin registers with a marketer's
// token and holds the open set to `OPEN`; a route added tomorrow is closed to
// the marketer without anyone remembering to close it, and opening one means
// adding it here.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import * as authService from '../pos/auth.service.js';
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

const MARKETER_PIN = '135790';

/** Every route the marketer may pass, `METHOD path` as registered under `/api/pos`. */
const OPEN = new Set([
  'GET /me',
  'POST /auth/logout',
  // menu.catalog
  'GET /products',
  'GET /products/:id',
  'POST /products',
  'PATCH /products/:id',
  'POST /uploads',
  'POST /products/:id/variants',
  'POST /products/:id/variants/batch',
  'POST /variants/internal-barcode',
  'PATCH /variants/:id',
  'POST /products/:id/archive',
  'POST /products/:id/restore',
  'POST /variants/:id/archive',
  'PUT /products/:id/tags',
  'GET /tags',
  'POST /tags',
  'PATCH /tags/:id',
  'DELETE /tags/:id',
  'POST /tags/:id/assign',
  'GET /modifier-groups',
  'POST /modifier-groups',
  'PATCH /modifier-groups/:id',
  'DELETE /modifier-groups/:id',
  'POST /modifier-groups/:id/modifiers',
  'PATCH /modifiers/:id',
  'DELETE /modifiers/:id',
  'PUT /products/:id/modifier-groups',
  // menu.tables
  'GET /halls',
  'POST /halls',
  'PATCH /halls/:id',
  'DELETE /halls/:id',
  'POST /tables',
  'PATCH /tables/positions',
  'PATCH /tables/:id',
  'DELETE /tables/:id',
  // menu.public
  'GET /store/public-menu',
  'PATCH /store/public-menu',
  'GET /store/profile',
  'PATCH /store/profile',
  'POST /store/logo',
  // menu.feedback
  'GET /feedback',
  'GET /feedback/summary',
  'POST /feedback/:id/handled',
]);

describe.skipIf(!hasDb)('POS «Маркетолог» role (МР1)', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let marketerId = 0;
  let marketerToken = '';

  const as = (token: string) => auth(token);
  const call = (method: string, url: string, token: string, payload?: unknown) =>
    app.inject({ method: method as 'GET', url: `/api/pos${url}`, headers: as(token), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('rmkt');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    marketerId = (await authService.createStaff(store.storeId, { displayName: 'Оля', pin: MARKETER_PIN, role: 'marketer' })).id;
    marketerToken = await issueToken(store.storeId, marketerId);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
  });

  // ── staff ───────────────────────────────────────────────────────────────

  describe('staff', () => {
    const create = (payload: Record<string, unknown>) => call('POST', '/staff', store.ownerToken, payload);

    it('is given by the owner only where the vertical offers it, with a six-digit PIN nobody else has', async () => {
      const boutique = await createTestStore('rmktb');
      try {
        const refused = await app.inject({
          method: 'POST',
          url: '/api/pos/staff',
          headers: as(boutique.ownerToken),
          payload: { display_name: 'Марк', pin: '246802', role: 'marketer' },
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().error).toMatch(/лише в кафе/);
      } finally {
        await dropTestStore(boutique.storeId);
      }

      expect((await create({ display_name: 'Марк', pin: '2468', role: 'marketer' })).json().error).toMatch(/6 цифр/);
      expect((await create({ display_name: 'Марк', pin: '246802', role: 'owner' })).statusCode).toBe(400);
      // The seller's PIN, and the marketer's: the PIN says who logs in.
      const taken = await create({ display_name: 'Марк', pin: store.sellerPin });
      expect(taken.statusCode).toBe(409);
      expect(taken.json().error).toMatch(/уже має інший співробітник/);
      expect((await create({ display_name: 'Марк', pin: MARKETER_PIN })).statusCode).toBe(409);

      const made = await create({ display_name: 'Марк', pin: '246802', role: 'marketer' });
      expect(made.statusCode).toBe(201);
      expect(made.json()).toMatchObject({ role: 'marketer' });
      const listed = (await call('GET', '/staff', store.ownerToken)).json() as Array<{ id: number; role: string }>;
      expect(listed.find((s) => s.id === made.json().id)?.role).toBe('marketer');
      expect(listed.map((s) => s.role)[0]).toBe('owner');

      // A marketer is switched off and on like a seller; the owner never.
      expect((await call('PATCH', `/staff/${made.json().id}`, store.ownerToken, { is_active: false })).statusCode).toBe(200);
      expect((await call('PATCH', `/staff/${store.ownerId}`, store.ownerToken, { is_active: false })).statusCode).toBe(400);
      expect((await call('PATCH', `/staff/${made.json().id}`, store.ownerToken, { is_active: true })).statusCode).toBe(200);
      await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [made.json().id]);
    });

    it('switches a seller to a marketer only with a new six-digit PIN, and ends their sessions', async () => {
      const seller = await authService.createStaff(store.storeId, { displayName: 'Іра', pin: '8642' });
      const tillToken = await issueToken(store.storeId, seller.id);
      const bare = await call('PATCH', `/staff/${seller.id}`, store.ownerToken, { role: 'marketer' });
      expect(bare.statusCode).toBe(400);
      expect(bare.json().error).toMatch(/новий PIN із 6 цифр/);
      expect((await call('PATCH', `/staff/${seller.id}`, store.ownerToken, { role: 'marketer', pin: MARKETER_PIN })).statusCode).toBe(409);

      const switched = await call('PATCH', `/staff/${seller.id}`, store.ownerToken, { role: 'marketer', pin: '864200' });
      expect(switched.statusCode).toBe(200);
      expect((await call('GET', '/me', tillToken)).statusCode).toBe(401);
      expect((await call('PATCH', `/staff/${store.ownerId}`, store.ownerToken, { role: 'seller' })).json().error).toMatch(
        /власника не змінюється/
      );
      // And back: a seller keeps the PIN it has.
      expect((await call('PATCH', `/staff/${seller.id}`, store.ownerToken, { role: 'seller' })).statusCode).toBe(200);
      await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [seller.id]);
    });

    it('asks a marketer’s new PIN for six digits too', async () => {
      const short = await call('POST', `/staff/${marketerId}/pin`, store.ownerToken, { pin: '1357' });
      expect(short.statusCode).toBe(400);
      expect(short.json().error).toMatch(/6 цифр/);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────

  it('logs in by PIN as a marketer, and not once the store stops being a café (М3)', async () => {
    const login = () =>
      app.inject({ method: 'POST', url: '/api/pos/auth/staff/pin', payload: { store_slug: store.slug, pin: MARKETER_PIN } });
    const ok = await login();
    expect(ok.statusCode).toBe(200);
    expect(ok.json().staff.role).toBe('marketer');
    expect(ok.json().store.vertical.staffRoles).toEqual(['marketer']);

    await pool.query(`UPDATE pos_stores SET vertical = 'clothing' WHERE id = $1`, [store.storeId]);
    try {
      const refused = await login();
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toMatchObject({ code: 'role_unavailable' });
      const live = await call('GET', '/me', marketerToken);
      expect(live.statusCode).toBe(403);
      expect(live.json().code).toBe('role_unavailable');
    } finally {
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [store.storeId]);
    }
  });

  // ── the route sweep ─────────────────────────────────────────────────────

  it('passes only the routes that open themselves to it, and every other staff route answers 403', async () => {
    const sweep = Fastify({ logger: false });
    const routes: Array<{ method: string; url: string }> = [];
    sweep.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        routes.push({ method, url: route.url });
      }
    });
    const { registerPosPlugin } = await import('../pos/pos.plugin.js');
    await registerPosPlugin(sweep);
    await sweep.ready();
    // A seller of its own, so nothing the sweep calls can end the fixture's sessions.
    const seller = await authService.createStaff(store.storeId, { displayName: 'Обхід', pin: '9753' });
    const sellerToken = await issueToken(store.storeId, seller.id);

    const leaks: string[] = [];
    const closedOpen: string[] = [];
    let staffRoutes = 0;
    try {
      for (const { method, url } of routes) {
        if (!url.startsWith('/api/pos/') || url.includes('*')) continue;
        const key = `${method} ${url.slice('/api/pos'.length)}`;
        // Logging out is open, and calling it would end the session under test.
        if (key === 'POST /auth/logout') continue;
        const concrete = url.replace(/:[A-Za-z_]+/g, '999999999');
        const send = (token?: string) =>
          sweep.inject({
            method: method as 'GET',
            url: concrete,
            headers: token ? as(token) : {},
            ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
          });
        if ((await send()).statusCode !== 401) continue; // not behind a staff login
        if ((await send(sellerToken)).statusCode === 401) continue; // another kind of login (super, licence)
        staffRoutes++;
        const answer = await send(marketerToken);
        const forbidden = answer.statusCode === 403 && answer.json().code === 'role_forbidden';
        if (OPEN.has(key) && forbidden) closedOpen.push(key);
        if (!OPEN.has(key) && !forbidden) leaks.push(`${key} → ${answer.statusCode}`);
      }
    } finally {
      await sweep.close();
      await pool.query(`UPDATE pos_staff SET is_active = FALSE WHERE id = $1`, [seller.id]);
    }
    expect(leaks).toEqual([]);
    expect(closedOpen).toEqual([]);
    // The sweep saw the till's surface, not an empty plugin.
    expect(staffRoutes).toBeGreaterThan(150);
  }, 120000);

  // ── the catalogue ───────────────────────────────────────────────────────

  describe('products', () => {
    let productId = 0;
    let variantId = 0;

    beforeAll(async () => {
      const made = await call('POST', '/products', store.ownerToken, {
        name: 'Борщ',
        variants: [{ attributes: { size: '300 г' }, price_cents: 18_000, cost_cents: 4_500, quantity: 0 }],
      });
      productId = made.json().id;
      variantId = made.json().variants[0].id;
    });

    it('reads the menu without the purchase price or the shelf', async () => {
      const list = (await call('GET', '/products', marketerToken)).json() as Array<{ id: number; variants: Array<Record<string, unknown>> }>;
      const borshch = list.find((p) => p.id === productId)!;
      expect(borshch.variants[0]).toMatchObject({ price_cents: 18_000 });
      expect(borshch.variants[0]).not.toHaveProperty('cost_cents');
      expect(borshch.variants[0]).not.toHaveProperty('quantity');
      const one = (await call('GET', `/products/${productId}`, marketerToken)).json();
      expect(one.variants[0]).not.toHaveProperty('cost_cents');
      // The owner still reads both.
      expect((await call('GET', `/products/${productId}`, store.ownerToken)).json().variants[0]).toMatchObject({ cost_cents: 4_500 });
    });

    it('edits what the guest reads, and nothing of the kitchen, the stock or the register', async () => {
      const edited = await call('PATCH', `/products/${productId}`, marketerToken, {
        name: 'Борщ український',
        description: 'З пампушками',
        allergens: ['celery'],
        menu_labels: ['hit'],
        menu_hidden: false,
        kind: 'simple',
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({ name: 'Борщ український', allergens: ['celery'], menu_labels: ['hit'] });
      expect(edited.json().variants[0]).not.toHaveProperty('cost_cents');

      const excise = await call('PATCH', `/products/${productId}`, marketerToken, { fiscal_excise: true, fiscal_uktzed: '2208' });
      expect(excise.statusCode).toBe(403);
      expect(excise.json()).toMatchObject({ code: 'role_forbidden' });
      expect(excise.json().error).toMatch(/акциз/);

      expect((await call('PATCH', `/variants/${variantId}`, marketerToken, { price_cents: 19_000 })).statusCode).toBe(200);
      // A form that resends the cost it was never shown cannot change it…
      expect((await call('PATCH', `/variants/${variantId}`, marketerToken, { cost_cents: 1 })).json().error).toMatch(/закупівельна/);
      // …while the same value is not a change.
      expect((await call('PATCH', `/variants/${variantId}`, marketerToken, { cost_cents: 4_500, price_cents: 19_500 })).statusCode).toBe(200);

      const opening = await call('POST', '/products', marketerToken, {
        name: 'Узвар',
        variants: [{ attributes: {}, price_cents: 5_000, quantity: 10 }],
      });
      expect(opening.statusCode).toBe(403);
      expect(opening.json().error).toMatch(/залишок/);
      const plain = await call('POST', '/products', marketerToken, {
        name: 'Узвар',
        description: 'Домашній',
        variants: [{ attributes: {}, price_cents: 5_000, quantity: 0, cost_cents: 0 }],
      });
      expect(plain.statusCode).toBe(201);
      expect(plain.json().variants[0]).not.toHaveProperty('quantity');

      // The money pages stay the owner's.
      expect((await call('GET', '/products/tech-cards', marketerToken)).json().code).toBe('role_forbidden');
      expect((await call('GET', '/markdowns', marketerToken)).json().code).toBe('role_forbidden');
      // And the seller still reaches none of it.
      expect((await call('GET', '/products', store.sellerToken)).statusCode).toBe(403);
    });
  });

  // ── halls, the QR menu, feedback ────────────────────────────────────────

  it('lays out the halls and gets the signed print link for the stickers', async () => {
    const hall = await call('POST', '/halls', marketerToken, { name: 'Тераса' });
    expect(hall.statusCode).toBe(200);
    const table = await call('POST', '/tables', marketerToken, { hall_id: hall.json().id, name: '1' });
    expect(table.statusCode).toBe(200);

    expect((await call('PATCH', '/store/public-menu', marketerToken, { enabled: true })).statusCode).toBe(200);
    const settings = (await call('GET', '/store/public-menu', marketerToken)).json();
    expect(settings).toMatchObject({ enabled: true, tables: 1 });
    expect(settings.print).toEqual(expect.any(String));
  });

  it('flips the menu’s own switches and the profile, never the hall’s or the address (М5)', async () => {
    expect((await call('PATCH', '/store/public-menu', marketerToken, { feedback_enabled: true })).statusCode).toBe(200);
    for (const body of [{ ordering_enabled: true }, { call_enabled: true }, { auto_kitchen: 'all', auto_kitchen_ack: true }]) {
      const refused = await call('PATCH', '/store/public-menu', marketerToken, body);
      expect(refused.statusCode).toBe(403);
      expect(refused.json().code).toBe('role_forbidden');
    }
    expect((await call('POST', '/store/public-menu/rotate', marketerToken)).json().code).toBe('role_forbidden');
    const profile = await call('PATCH', '/store/profile', marketerToken, {
      address: 'вул. Соборна, 1',
      corkage: { fee_cents: 10_000, min_food_cents: null, note: null },
    });
    expect(profile.statusCode).toBe(200);
  });

  it('reads guests’ feedback without the phone they left for the owner (М7)', async () => {
    const inserted = await pool.query(
      `INSERT INTO pos_guest_feedback (store_id, client_uuid, score, comment, phone)
       VALUES ($1, $2, 2, 'Холодний суп', '+380501112233') RETURNING id`,
      [store.storeId, randomUUID()]
    );
    const id = Number(inserted.rows[0].id);
    const mine = (await call('GET', '/feedback', marketerToken)).json();
    const row = mine.rows.find((r: { id: number }) => r.id === id);
    expect(row).toMatchObject({ score: 2, comment: 'Холодний суп' });
    expect(row).not.toHaveProperty('phone');
    expect(JSON.stringify((await call('GET', '/feedback/summary', marketerToken)).json())).not.toContain('380501112233');
    const handled = await call('POST', `/feedback/${id}/handled`, marketerToken, {});
    expect(handled.statusCode).toBe(200);
    expect(handled.json()).not.toHaveProperty('phone');
    // The owner keeps the call-back number.
    const owners = (await call('GET', '/feedback', store.ownerToken)).json();
    expect(owners.rows.find((r: { id: number }) => r.id === id).phone).toBe('+380501112233');
  });
});
