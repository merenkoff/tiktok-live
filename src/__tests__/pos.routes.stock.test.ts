// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.stock.test.ts
//
// stock.routes — the widest single route file in the POS (adjustments,
// suppliers, stock documents and their lines, reports). Everything here is
// owner-only behind the `stock` module, so the gate is asserted once per verb
// family; the rest is the route layer's own validation and status mapping.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe.skipIf(!hasDb)('POS stock routes', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let product: TestProduct;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rstock');
    app = await buildPosTestApp();
    product = await seedProduct(store.storeId, { name: 'Stock subject', quantity: 10 });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  const OWNER_ONLY: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string]> = [
    ['POST', '/api/pos/stock/adjust'],
    ['GET', '/api/pos/stock/low'],
    ['GET', '/api/pos/suppliers'],
    ['POST', '/api/pos/suppliers'],
    ['GET', '/api/pos/stock/documents'],
    ['POST', '/api/pos/stock/documents'],
    ['GET', '/api/pos/stock/reports/on-hand'],
    ['GET', '/api/pos/stock/reports/movements'],
    ['GET', '/api/pos/stock/reports/document-summary'],
  ];

  describe('access control', () => {
    it.each(OWNER_ONLY)('401s %s %s without a token', async (method, url) => {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it.each(OWNER_ONLY)('403s %s %s for a seller', async (method, url) => {
      const res = await app.inject({ method, url, headers: auth(store.sellerToken), payload: {} });
      expect(res.statusCode).toBe(403);
    });

    it('404s the whole surface when the stock module is off', async () => {
      const temp = await createTestStore('rstockoff');
      try {
        await setEnabledModules(temp.storeId, ['products']);
        for (const [method, url] of OWNER_ONLY) {
          const res = await app.inject({
            method,
            url,
            headers: auth(temp.ownerToken),
            payload: {},
          });
          expect(res.statusCode).toBe(404);
        }
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /stock/adjust', () => {
    it('applies a positive delta', async () => {
      const before = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
        product.variantId,
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/adjust',
        headers: auth(store.ownerToken),
        payload: { variant_id: product.variantId, delta: 5, note: 'recount' },
      });
      expect(res.statusCode).toBe(200);

      const after = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
        product.variantId,
      ]);
      expect(Number(after.rows[0].quantity) - Number(before.rows[0].quantity)).toBe(5);
    });

    it('400s without variant_id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/adjust',
        headers: auth(store.ownerToken),
        payload: { delta: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('variant_id and delta required');
    });

    it('400s when delta is not a number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/adjust',
        headers: auth(store.ownerToken),
        payload: { variant_id: product.variantId, delta: '5' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('variant_id and delta required');
    });

    it('400s on delta 0 — the route guard passes it but the service rejects it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/adjust',
        headers: auth(store.ownerToken),
        payload: { variant_id: product.variantId, delta: 0 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Delta cannot be zero');
    });

    it('400s for a variant from another store', async () => {
      const temp = await createTestStore('rstockx');
      try {
        const foreign = await seedProduct(temp.storeId);
        const res = await app.inject({
          method: 'POST',
          url: '/api/pos/stock/adjust',
          headers: auth(store.ownerToken),
          payload: { variant_id: foreign.variantId, delta: 1 },
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('suppliers', () => {
    it('creates with 201 and lists it back', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/pos/suppliers',
        headers: auth(store.ownerToken),
        payload: { name: 'Route Supplier', phone: '0670000000' },
      });
      expect(created.statusCode).toBe(201);

      const listed = await app.inject({
        method: 'GET',
        url: '/api/pos/suppliers',
        headers: auth(store.ownerToken),
      });
      expect(listed.json().map((s: { name: string }) => s.name)).toContain('Route Supplier');
    });

    it('400s without a name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/suppliers',
        headers: auth(store.ownerToken),
        payload: { phone: '0670000000' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('name required');
    });

    it('400s patching a supplier from another store', async () => {
      const temp = await createTestStore('rsuppx');
      try {
        const foreign = await pool.query(
          `INSERT INTO pos_suppliers (store_id, name) VALUES ($1, 'Foreign') RETURNING id`,
          [temp.storeId]
        );
        const res = await app.inject({
          method: 'PATCH',
          url: `/api/pos/suppliers/${foreign.rows[0].id}`,
          headers: auth(store.ownerToken),
          payload: { name: 'Hijacked' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('Supplier not found');
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('stock documents', () => {
    it('creates a receipt with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: { type: 'receipt' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('draft');
    });

    it('400s without a type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('type required');
    });

    it('400s a writeoff with no reason_code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: { type: 'writeoff' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('reason_code required');
    });

    it('400s a supplier_id on a non-receipt document', async () => {
      const supplier = await app.inject({
        method: 'POST',
        url: '/api/pos/suppliers',
        headers: auth(store.ownerToken),
        payload: { name: `S-${Date.now()}` },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: {
          type: 'writeoff',
          reason_code: 'damage',
          supplier_id: supplier.json().id,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('supplier_id only allowed on receipt');
    });

    it('404s an unknown document', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/stock/documents/999999999',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Document not found');
    });

    it('404s a document owned by another store', async () => {
      const temp = await createTestStore('rdocx');
      try {
        const foreign = await app.inject({
          method: 'POST',
          url: '/api/pos/stock/documents',
          headers: auth(temp.ownerToken),
          payload: { type: 'receipt' },
        });
        const res = await app.inject({
          method: 'GET',
          url: `/api/pos/stock/documents/${foreign.json().id}`,
          headers: auth(store.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    describe('lines', () => {
      let documentId: number;

      beforeAll(async () => {
        const doc = await app.inject({
          method: 'POST',
          url: '/api/pos/stock/documents',
          headers: auth(store.ownerToken),
          payload: { type: 'receipt' },
        });
        documentId = doc.json().id;
      });

      it('400s without a variant_id', async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines`,
          headers: auth(store.ownerToken),
          payload: { quantity: 1 },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('variant_id required');
      });

      it('adds a line with 201', async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines`,
          headers: auth(store.ownerToken),
          payload: { variant_id: product.variantId, quantity: 4, unit_cost_cents: 500 },
        });
        expect(res.statusCode).toBe(201);
      });

      it('400s a placeholder with no name', async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines/placeholder`,
          headers: auth(store.ownerToken),
          payload: { quantity: 1, price_cents: 100 },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('name required');
      });

      it('400s a placeholder with no price', async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines/placeholder`,
          headers: auth(store.ownerToken),
          payload: { name: 'Unknown item', quantity: 1 },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('price_cents required');
      });

      it.each([0, -1, undefined])('400s a placeholder with quantity %s', async (quantity) => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines/placeholder`,
          headers: auth(store.ownerToken),
          payload: { name: 'Unknown item', price_cents: 100, quantity },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('quantity must be positive');
      });

      it('creates a placeholder line with similar-product suggestions', async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/pos/stock/documents/${documentId}/lines/placeholder`,
          headers: auth(store.ownerToken),
          payload: { name: 'Stock subject lookalike', quantity: 2, price_cents: 1000 },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toHaveProperty('similar_products');
        expect(Array.isArray(res.json().similar_products)).toBe(true);
      });

      it('400s removing a line that is not on the document', async () => {
        const res = await app.inject({
          method: 'DELETE',
          url: `/api/pos/stock/documents/${documentId}/lines/999999999`,
          headers: auth(store.ownerToken),
        });
        expect(res.statusCode).toBe(400);
      });
    });

    it('posts a draft, and a repeat post is idempotent rather than an error', async () => {
      const doc = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: { type: 'receipt' },
      });
      const id = doc.json().id;
      await app.inject({
        method: 'POST',
        url: `/api/pos/stock/documents/${id}/lines`,
        headers: auth(store.ownerToken),
        payload: { variant_id: product.variantId, quantity: 3, unit_cost_cents: 100 },
      });

      const posted = await app.inject({
        method: 'POST',
        url: `/api/pos/stock/documents/${id}/post`,
        headers: auth(store.ownerToken),
      });
      expect(posted.statusCode).toBe(200);
      expect(posted.json().status).toBe('posted');

      // A double-post must not double-apply the stock movement: postDocument
      // short-circuits on an already-posted document and echoes it back.
      const stockAfterFirst = await pool.query(
        `SELECT quantity FROM pos_stock WHERE variant_id = $1`,
        [product.variantId]
      );
      const again = await app.inject({
        method: 'POST',
        url: `/api/pos/stock/documents/${id}/post`,
        headers: auth(store.ownerToken),
      });
      expect(again.statusCode).toBe(200);
      expect(again.json().status).toBe('posted');

      const stockAfterSecond = await pool.query(
        `SELECT quantity FROM pos_stock WHERE variant_id = $1`,
        [product.variantId]
      );
      expect(Number(stockAfterSecond.rows[0].quantity)).toBe(
        Number(stockAfterFirst.rows[0].quantity)
      );
    });

    it('400s deleting a posted document', async () => {
      const doc = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: { type: 'receipt' },
      });
      const id = doc.json().id;
      await app.inject({
        method: 'POST',
        url: `/api/pos/stock/documents/${id}/lines`,
        headers: auth(store.ownerToken),
        payload: { variant_id: product.variantId, quantity: 1, unit_cost_cents: 100 },
      });
      await app.inject({
        method: 'POST',
        url: `/api/pos/stock/documents/${id}/post`,
        headers: auth(store.ownerToken),
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/stock/documents/${id}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(400);
    });

    it('deletes a draft', async () => {
      const doc = await app.inject({
        method: 'POST',
        url: '/api/pos/stock/documents',
        headers: auth(store.ownerToken),
        payload: { type: 'receipt' },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/pos/stock/documents/${doc.json().id}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });
  });

  describe('reports', () => {
    it('serves on-hand rows scoped to the store', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/stock/reports/on-hand',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it('filters movements by variant_id from the query string', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/stock/reports/movements?variant_id=${product.variantId}`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(
        res.json().every((m: { variant_id: number }) => m.variant_id === product.variantId)
      ).toBe(true);
    });

    it('400s movement-summary without both from and to', async () => {
      const missingBoth = await app.inject({
        method: 'GET',
        url: '/api/pos/stock/reports/movement-summary',
        headers: auth(store.ownerToken),
      });
      const missingTo = await app.inject({
        method: 'GET',
        url: '/api/pos/stock/reports/movement-summary?from=2026-01-01',
        headers: auth(store.ownerToken),
      });
      expect(missingBoth.statusCode).toBe(400);
      expect(missingBoth.json().error).toBe('from and to required');
      expect(missingTo.statusCode).toBe(400);
    });

    it('serves movement-summary when both dates are given', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/stock/reports/movement-summary?from=2026-01-01&to=2026-12-31',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
