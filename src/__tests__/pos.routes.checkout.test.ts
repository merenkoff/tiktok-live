// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.checkout.test.ts
//
// checkout.routes + returns.routes. Checkout is core — it must work for a plain
// cashier with no modules enabled at all — while the sales *history* behind it
// sits under the `returns` module. The idempotency contract is the other thing
// worth nailing down: a replayed sale answers 200 with the original receipt,
// a fresh one 201, and the header form is only honoured for a well-formed UUID.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  setEnabledModules,
  type TestProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS checkout & returns routes', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rsale');
    app = await buildPosTestApp();
    product = await seedProduct(store.storeId, {
      name: 'Checkout subject',
      priceCents: 20000,
      quantity: 500,
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  /** One unit, paid in full, as the cashier UI would post it. */
  function cart(overrides: Record<string, unknown> = {}) {
    return {
      items: [{ variant_id: product.variantId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 20000 }],
      ...overrides,
    };
  }

  describe('POST /sales/complete', () => {
    it('completes a sale with 201 for a seller', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: cart(),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().total_cents).toBe(20000);
      expect(res.json().receipt_number).toEqual(expect.any(String));
    });

    it('401s without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        payload: cart(),
      });
      expect(res.statusCode).toBe(401);
    });

    it('still works when every toggleable module is off — checkout is core', async () => {
      const temp = await createTestStore('rsalecore');
      try {
        await setEnabledModules(temp.storeId, []);
        const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 5 });
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(temp.sellerToken),
          payload: {
            items: [{ variant_id: item.variantId, quantity: 1 }],
            payments: [{ method: 'cash', amount_cents: 1000 }],
          },
        });
        expect(res.statusCode).toBe(201);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('400s an empty cart', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: { items: [], payments: [{ method: 'cash', amount_cents: 0 }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Cart is empty');
    });

    it('400s with no payment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: { items: [{ variant_id: product.variantId, quantity: 1 }], payments: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Payment required');
    });

    it('400s a zero-quantity line', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: cart({ items: [{ variant_id: product.variantId, quantity: 0 }] }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Invalid cart item');
    });

    it('400s an unknown customer_id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: cart({ customer_id: 999_999_999 }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Customer not found');
    });

    it('400s a variant belonging to another store', async () => {
      const temp = await createTestStore('rsalex');
      try {
        const foreign = await seedProduct(temp.storeId, { priceCents: 20000, quantity: 5 });
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(store.sellerToken),
          payload: cart({ items: [{ variant_id: foreign.variantId, quantity: 1 }] }),
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    describe('idempotency', () => {
      it('replays a body client_uuid as 200 with the original receipt', async () => {
        const clientUuid = randomUUID();
        const first = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(store.sellerToken),
          payload: cart({ client_uuid: clientUuid }),
        });
        const replay = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(store.sellerToken),
          payload: cart({ client_uuid: clientUuid }),
        });

        expect(first.statusCode).toBe(201);
        expect(replay.statusCode).toBe(200);
        expect(replay.json().id).toBe(first.json().id);
        expect(replay.json().receipt_number).toBe(first.json().receipt_number);
      });

      it('does not deduct stock twice on a replay', async () => {
        const clientUuid = randomUUID();
        await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(store.sellerToken),
          payload: cart({ client_uuid: clientUuid }),
        });
        const afterFirst = await pool.query(
          `SELECT quantity FROM pos_stock WHERE variant_id = $1`,
          [product.variantId]
        );
        await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(store.sellerToken),
          payload: cart({ client_uuid: clientUuid }),
        });
        const afterReplay = await pool.query(
          `SELECT quantity FROM pos_stock WHERE variant_id = $1`,
          [product.variantId]
        );
        expect(Number(afterReplay.rows[0].quantity)).toBe(Number(afterFirst.rows[0].quantity));
      });

      it('accepts the Idempotency-Key header when it is a well-formed UUID', async () => {
        const key = randomUUID();
        const first = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: { ...auth(store.sellerToken), 'idempotency-key': key },
          payload: cart(),
        });
        const replay = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: { ...auth(store.sellerToken), 'idempotency-key': key },
          payload: cart(),
        });
        expect(first.statusCode).toBe(201);
        expect(replay.statusCode).toBe(200);
        expect(replay.json().id).toBe(first.json().id);
      });

      it('ignores a malformed Idempotency-Key and treats each post as new', async () => {
        const headers = { ...auth(store.sellerToken), 'idempotency-key': 'not-a-uuid' };
        const first = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers,
          payload: cart(),
        });
        const second = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers,
          payload: cart(),
        });
        expect(first.statusCode).toBe(201);
        expect(second.statusCode).toBe(201);
        expect(second.json().id).not.toBe(first.json().id);
      });

      it('lets the body client_uuid win over the header', async () => {
        const bodyUuid = randomUUID();
        const first = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: { ...auth(store.sellerToken), 'idempotency-key': randomUUID() },
          payload: cart({ client_uuid: bodyUuid }),
        });
        const replay = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: { ...auth(store.sellerToken), 'idempotency-key': randomUUID() },
          payload: cart({ client_uuid: bodyUuid }),
        });
        expect(replay.statusCode).toBe(200);
        expect(replay.json().id).toBe(first.json().id);
      });
    });
  });

  describe('POST /sales/:id/void', () => {
    it('voids a completed sale', async () => {
      const sale = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: cart(),
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/sales/${sale.json().id}/void`,
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('voided');
    });

    it('400s voiding an unknown sale', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/999999999/void',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(400);
    });

    it('400s voiding a sale from another store', async () => {
      const temp = await createTestStore('rvoidx');
      try {
        const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 5 });
        const foreign = await app.inject({
          method: 'POST',
          url: '/api/pos/sales/complete',
          headers: auth(temp.sellerToken),
          payload: {
            items: [{ variant_id: item.variantId, quantity: 1 }],
            payments: [{ method: 'cash', amount_cents: 1000 }],
          },
        });
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/sales/${foreign.json().id}/void`,
          headers: auth(store.sellerToken),
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /sales/:id/refunds', () => {
    it('refunds a line and returns the stock', async () => {
      const sale = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: cart(),
      });
      const saleItemId = sale.json().items[0].id;
      const before = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
        product.variantId,
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/sales/${sale.json().id}/refunds`,
        headers: auth(store.sellerToken),
        payload: { items: [{ sale_item_id: saleItemId, quantity: 1 }], reason: 'too small' },
      });
      expect(res.statusCode).toBe(200);

      const after = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
        product.variantId,
      ]);
      expect(Number(after.rows[0].quantity) - Number(before.rows[0].quantity)).toBe(1);
    });

    it('400s refunding an unknown sale', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/999999999/refunds',
        headers: auth(store.sellerToken),
        payload: { items: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('returns routes (`returns` module)', () => {
    it('lists sales for a signed-in cashier', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/sales',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it('honours the limit query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/sales?limit=1',
        headers: auth(store.sellerToken),
      });
      expect(res.json()).toHaveLength(1);
    });

    it('404s a sale that does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/sales/999999999',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Sale not found');
    });

    it('404s both endpoints when the returns module is off', async () => {
      const temp = await createTestStore('rretoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        const list = await app.inject({
          method: 'GET',
          url: '/api/pos/sales',
          headers: auth(temp.sellerToken),
        });
        const one = await app.inject({
          method: 'GET',
          url: '/api/pos/sales/1',
          headers: auth(temp.sellerToken),
        });
        expect(list.statusCode).toBe(404);
        expect(one.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('401s without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/sales' });
      expect(res.statusCode).toBe(401);
    });
  });
});
