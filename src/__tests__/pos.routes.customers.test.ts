// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.customers.test.ts
//
// customers.routes. Note the deliberate asymmetry this pins down: the *list* is
// open to any signed-in cashier because the checkout screen needs a customer
// picker even when the `customers` module is off, while every read-one and
// every write sits behind the module gate.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import * as customersService from '../pos/customers.service.js';
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

describe.skipIf(!hasDb)('POS customers routes', () => {
  let app: FastifyInstance;
  let store: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rcust');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  describe('module gating', () => {
    it('keeps GET /customers open when the customers module is off', async () => {
      const temp = await createTestStore('rcustoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/customers',
          headers: auth(temp.sellerToken),
        });
        expect(res.statusCode).toBe(200);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it.each([
      ['GET', '/api/pos/customers/1'],
      ['POST', '/api/pos/customers'],
      ['PATCH', '/api/pos/customers/1'],
      ['DELETE', '/api/pos/customers/1'],
    ])('404s %s %s when the customers module is off', async (method, url) => {
      const temp = await createTestStore('rcustoff2');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const res = await app.inject({
          method: method as 'GET',
          url,
          headers: auth(temp.ownerToken),
          payload: { name: 'X', phone: '380670000000' },
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('401s every customers endpoint without a token', async () => {
      for (const [method, url] of [
        ['GET', '/api/pos/customers'],
        ['POST', '/api/pos/customers'],
        ['GET', '/api/pos/customers/1'],
      ] as const) {
        const res = await app.inject({ method, url, payload: {} });
        expect(res.statusCode).toBe(401);
      }
    });

    it('lets a seller create a customer — this module is not owner-only', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.sellerToken),
        payload: { name: 'Seller made', phone: '380671000001' },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('POST /customers', () => {
    it('creates with 201 and a normalized phone', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.ownerToken),
        payload: { name: 'Route customer', phone: '+38 (067) 100-00-02' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().phone).toBe('380671000002');
    });

    it('400s when name or phone is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.ownerToken),
        payload: { name: 'No phone' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('name and phone required');
    });

    it('400s an invalid child birthday', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.ownerToken),
        payload: {
          name: 'Bad child',
          phone: '380671000003',
          children_birthdays: [{ name: 'Kid', birthday: 'yesterday' }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('YYYY-MM-DD');
    });

    it('merges rather than 409s on a duplicate phone', async () => {
      // POST never 409s on a duplicate phone: the service swallows the 23505
      // and updates the existing row instead. Re-posting the same phone is how
      // the offline cashier replays a queued write.
      const first = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.ownerToken),
        payload: { name: 'First name', phone: '380671000004' },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/pos/customers',
        headers: auth(store.ownerToken),
        payload: { name: 'Second name', phone: '380671000004' },
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().id).toBe(first.json().id);
      expect(second.json().name).toBe('Second name');
    });
  });

  describe('GET /customers', () => {
    it('filters by the q parameter', async () => {
      await customersService.createCustomer(store.storeId, {
        name: 'Findable Person',
        phone: '380671000010',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/customers?q=findable',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().map((c: { name: string }) => c.name)).toContain('Findable Person');
    });

    it('ignores q under all=1 so the cashier can snapshot everything', async () => {
      const filtered = await app.inject({
        method: 'GET',
        url: '/api/pos/customers?q=findable',
        headers: auth(store.sellerToken),
      });
      const snapshot = await app.inject({
        method: 'GET',
        url: '/api/pos/customers?q=findable&all=1',
        headers: auth(store.sellerToken),
      });
      expect(snapshot.json().length).toBeGreaterThan(filtered.json().length);
    });

    it('never returns customers from another store', async () => {
      const temp = await createTestStore('rcustx');
      try {
        await customersService.createCustomer(temp.storeId, {
          name: 'Foreign Person',
          phone: '380679000000',
        });
        const res = await app.inject({
          method: 'GET',
          url: '/api/pos/customers?all=1',
          headers: auth(store.ownerToken),
        });
        expect(res.json().map((c: { name: string }) => c.name)).not.toContain('Foreign Person');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('GET /customers/:id', () => {
    it('404s for an unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/customers/999999999',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Customer not found');
    });

    it('404s for a customer belonging to another store', async () => {
      const temp = await createTestStore('rcustx2');
      try {
        const foreign = await customersService.createCustomer(temp.storeId, {
          name: 'Not mine',
          phone: '380679000001',
        });
        const res = await app.inject({
          method: 'GET',
          url: `/api/pos/customers/${foreign.id}`,
          headers: auth(store.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('PATCH /customers/:id', () => {
    it('updates and returns the row', async () => {
      const created = await customersService.createCustomer(store.storeId, {
        name: 'Patchable',
        phone: '380671000020',
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/customers/${created.id}`,
        headers: auth(store.ownerToken),
        payload: { name: 'Patched' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Patched');
    });

    it('409s when moving a customer onto a phone another one already holds', async () => {
      const a = await customersService.createCustomer(store.storeId, {
        name: 'Phone holder A',
        phone: '380671000040',
      });
      await customersService.createCustomer(store.storeId, {
        name: 'Phone holder B',
        phone: '380671000041',
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pos/customers/${a.id}`,
        headers: auth(store.ownerToken),
        payload: { phone: '380671000041' },
      });
      expect(res.statusCode).toBe(409);
      // Never the raw Postgres constraint name — this reaches the cashier's screen.
      expect(res.json().error).toBe('Another customer already uses this phone');
    });

    it('400s for a customer from another store', async () => {
      const temp = await createTestStore('rcustx3');
      try {
        const foreign = await customersService.createCustomer(temp.storeId, {
          name: 'Foreign patch',
          phone: '380679000002',
        });
        const res = await app.inject({
          method: 'PATCH',
          url: `/api/pos/customers/${foreign.id}`,
          headers: auth(store.ownerToken),
          payload: { name: 'Hijacked' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('Customer not found');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('DELETE /customers/:id', () => {
    it('deletes a customer with no sales', async () => {
      const created = await customersService.createCustomer(store.storeId, {
        name: 'Deletable via route',
        phone: '380671000030',
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/customers/${created.id}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('400s when the customer has sales history', async () => {
      const created = await customersService.createCustomer(store.storeId, {
        name: 'Undeletable',
        phone: '380671000031',
      });
      await pool.query(
        `INSERT INTO pos_sales (store_id, staff_id, receipt_number, customer_id, total_cents)
         VALUES ($1, $2, $3, $4, 500)`,
        [store.storeId, store.sellerId, 'R-00001', created.id]
      );
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/customers/${created.id}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Cannot delete customer with sales history');
    });

    it('400s for an unknown id', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/pos/customers/999999999',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Customer not found');
    });
  });
  describe('personal discount — the owner gives it, the cashier cannot', () => {
    const post = (token: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/pos/customers', headers: auth(token), payload });
    const patch = (token: string, id: number, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `/api/pos/customers/${id}`, headers: auth(token), payload });
    const stored = async (id: number) =>
      Number((await pool.query(`SELECT discount_percent FROM pos_customers WHERE id = $1`, [id])).rows[0].discount_percent);

    it('lets the owner create a card with a discount; it defaults to 0', async () => {
      const gold = await post(store.ownerToken, { name: 'Gold', phone: '380672000001', discount_percent: 7 });
      expect(gold.statusCode).toBe(201);
      expect(gold.json().discount_percent).toBe(7);
      const plain = await post(store.ownerToken, { name: 'Plain', phone: '380672000002' });
      expect(plain.json().discount_percent).toBe(0);
    });

    it('403s a seller who tries to create a card with a discount — and writes nothing', async () => {
      const res = await post(store.sellerToken, { name: 'Sneaky', phone: '380672000003', discount_percent: 5 });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('Знижку клієнта задає лише власник');
      const rows = await pool.query(`SELECT 1 FROM pos_customers WHERE store_id = $1 AND phone = '380672000003'`, [
        store.storeId,
      ]);
      expect(rows.rowCount).toBe(0);
    });

    it('lets a seller open a card without one, and it gets 0', async () => {
      const res = await post(store.sellerToken, { name: 'Honest', phone: '380672000004' });
      expect(res.statusCode).toBe(201);
      expect(res.json().discount_percent).toBe(0);
    });

    it('does not let a seller\'s duplicate-phone write reset the owner\'s discount — even with an explicit 0', async () => {
      const made = await post(store.ownerToken, { name: 'Loyal', phone: '380672000005', discount_percent: 10 });
      const merged = await post(store.sellerToken, { name: 'Loyal renamed', phone: '380672000005', discount_percent: 0 });
      expect(merged.statusCode).toBe(201);
      expect(merged.json().id).toBe(made.json().id);
      expect(merged.json().name).toBe('Loyal renamed');
      expect(await stored(made.json().id)).toBe(10);
    });

    it('lets the owner\'s duplicate-phone write set the discount on the existing card', async () => {
      const made = await post(store.sellerToken, { name: 'Walk-in', phone: '380672000006' });
      const merged = await post(store.ownerToken, { name: 'Walk-in', phone: '380672000006', discount_percent: 15 });
      expect(merged.json().id).toBe(made.json().id);
      expect(await stored(made.json().id)).toBe(15);
    });

    it('lets the owner set, change and clear it with PATCH', async () => {
      const made = await post(store.ownerToken, { name: 'Patched', phone: '380672000007' });
      const id = made.json().id as number;
      expect((await patch(store.ownerToken, id, { discount_percent: 12 })).json().discount_percent).toBe(12);
      expect((await patch(store.ownerToken, id, { discount_percent: 4 })).json().discount_percent).toBe(4);
      expect((await patch(store.ownerToken, id, { discount_percent: null })).json().discount_percent).toBe(0);
    });

    it('403s a seller who PATCHes a different discount, and leaves the stored one', async () => {
      const made = await post(store.ownerToken, { name: 'Guarded', phone: '380672000008', discount_percent: 6 });
      const id = made.json().id as number;
      const res = await patch(store.sellerToken, id, { name: 'Guarded renamed', discount_percent: 60 });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('Знижку клієнта задає лише власник');
      expect(await stored(id)).toBe(6);
      // The refused write is refused whole: the name did not change either.
      const row = await pool.query(`SELECT name FROM pos_customers WHERE id = $1`, [id]);
      expect(row.rows[0].name).toBe('Guarded');
    });

    it('lets a seller send a card back whole — the unchanged discount is not a price change', async () => {
      const made = await post(store.ownerToken, { name: 'Whole card', phone: '380672000009', discount_percent: 9 });
      const id = made.json().id as number;
      const res = await patch(store.sellerToken, id, { name: 'Whole card fixed', discount_percent: 9 });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Whole card fixed');
      expect(res.json().discount_percent).toBe(9);
    });

    it('lets a seller edit the rest of a card without touching the discount', async () => {
      const made = await post(store.ownerToken, { name: 'Edited', phone: '380672000010', discount_percent: 11 });
      const res = await patch(store.sellerToken, made.json().id as number, { email: 'edited@example.com' });
      expect(res.statusCode).toBe(200);
      expect(res.json().discount_percent).toBe(11);
    });

    it.each([
      [101, '380672000021'],
      [-1, '380672000022'],
      [2.5, '380672000023'],
      ['abc', '380672000024'],
    ])('400s %j from the owner, on create and on update', async (value, phone) => {
      const created = await post(store.ownerToken, { name: 'Bad value', phone, discount_percent: value });
      expect(created.statusCode).toBe(400);
      expect(created.json().error).toContain('від 0 до 100');
      const made = await post(store.ownerToken, { name: 'Bad patch', phone: `${phone}0` });
      const res = await patch(store.ownerToken, made.json().id as number, { discount_percent: value });
      expect(res.statusCode).toBe(400);
      expect(await stored(made.json().id)).toBe(0);
    });

    it('returns the discount in the list and the snapshot the offline till downloads', async () => {
      const made = await post(store.ownerToken, { name: 'Snapshot me', phone: '380672000011', discount_percent: 3 });
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/customers?snapshot=1',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      const row = (res.json() as Array<{ id: number; discount_percent: number }>).find((c) => c.id === made.json().id);
      expect(row?.discount_percent).toBe(3);
    });
  });
});
