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
});
