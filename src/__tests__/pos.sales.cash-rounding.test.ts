// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Cash rounding end to end on the server (НБУ № 25; TechDocs/POS_CASH_ROUNDING.md):
// what a sale, a refund and an exchange store, what the payment check accepts,
// what the owner's summary adds up to, and that the setting travels with the
// login. The arithmetic itself is `pos.cash-rounding.test.ts`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { completeSale, exchangeSale, getSale, listSales, refundSale } from '../pos/sales.service.js';
import { getSalesSummary } from '../pos/analytics.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

describe.skipIf(!hasDb)('cash rounding', () => {
  let store: TestStore;
  let app: FastifyInstance;
  /** 221,23 ₴ — rounds down: −3 by 10 kopecks, −23 by 50. */
  let down: number;
  /** 221,30 ₴ — rounds up by 50 kopecks (+20), not at all by 10. */
  let up: number;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('cashround');
    down = (await seedProduct(store.storeId, { name: 'Сир', priceCents: 22_123, quantity: 100 })).variantId;
    up = (await seedProduct(store.storeId, { name: 'Хліб', priceCents: 22_130, quantity: 100 })).variantId;
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  function sell(variantId: number, payments: Array<{ method: 'cash' | 'card' | 'qr'; amount_cents: number }>, cashRounding?: unknown) {
    return completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments,
      ...(cashRounding === undefined ? {} : { cash_rounding: cashRounding }),
    });
  }

  describe('a sale', () => {
    it('keeps the goods total and stores the rounding beside it', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 50_000 }], 50);
      expect(sale).toMatchObject({ total_cents: 22_123, cash_rounding: 50, rounding_cents: -23 });
      // The lines are untouched: rounding is not a discount.
      expect(sale!.items[0]).toMatchObject({ line_total_cents: 22_123, line_discount_cents: 0 });
      expect(sale!.cart_discount_cents).toBe(0);
      // The cash row stays what was handed over — the receipt prints the change from it.
      expect(sale!.payments).toEqual([expect.objectContaining({ method: 'cash', amount_cents: 50_000 })]);
    });

    it('accepts the rounded sum as full payment', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 22_100 }], 50);
      expect(sale).toMatchObject({ rounding_cents: -23 });
    });

    it('still asks a till that sends no step for the exact sum', async () => {
      await expect(sell(down, [{ method: 'cash', amount_cents: 22_100 }])).rejects.toThrow(
        'Insufficient payment'
      );
      const exact = await sell(down, [{ method: 'cash', amount_cents: 22_123 }]);
      expect(exact).toMatchObject({ cash_rounding: 0, rounding_cents: 0 });
    });

    it('rounds up as well, and then wants the rounded-up sum', async () => {
      await expect(sell(up, [{ method: 'cash', amount_cents: 22_130 }], 50)).rejects.toThrow(
        'Insufficient payment'
      );
      const sale = await sell(up, [{ method: 'cash', amount_cents: 22_150 }], 50);
      expect(sale).toMatchObject({ total_cents: 22_130, rounding_cents: 20 });
      // By 10 kopecks the same sum is already round.
      const ten = await sell(up, [{ method: 'cash', amount_cents: 22_130 }], 10);
      expect(ten).toMatchObject({ cash_rounding: 10, rounding_cents: 0 });
    });

    it('never rounds a card or QR receipt (п. 6)', async () => {
      const card = await sell(down, [{ method: 'card', amount_cents: 22_123 }], 50);
      expect(card).toMatchObject({ cash_rounding: 0, rounding_cents: 0 });
      await expect(sell(down, [{ method: 'card', amount_cents: 22_100 }], 50)).rejects.toThrow(
        'Insufficient payment'
      );
    });

    it('rounds only the cash part of a mixed payment', async () => {
      const sale = await sell(
        down,
        [
          { method: 'card', amount_cents: 10_000 },
          { method: 'cash', amount_cents: 12_100 },
        ],
        50
      );
      expect(sale).toMatchObject({ cash_rounding: 50, rounding_cents: -23 });
    });

    it('refuses a step that is not 0, 10 or 50 in words', async () => {
      await expect(sell(down, [{ method: 'cash', amount_cents: 50_000 }], 25)).rejects.toThrow(
        /крок заокруглення/
      );
    });

    it('shows the rounding in the receipts list too', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 22_100 }], 50);
      const rows = await listSales(store.storeId, { limit: 50 });
      expect(rows.find((row) => row.id === sale!.id)).toMatchObject({ total_cents: 22_123, rounding_cents: -23 });
    });
  });

  describe('a refund', () => {
    it('rounds money handed back in cash and keeps the goods total', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 22_100 }], 50);
      const after = await refundSale({
        storeId: store.storeId,
        saleId: sale!.id,
        staffId: store.sellerId,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
        method: 'cash',
        cash_rounding: 50,
      });
      expect(after!.refunds[0]).toMatchObject({
        method: 'cash',
        total_cents: 22_123,
        cash_rounding: 50,
        rounding_cents: -23,
      });
      // «Fully refunded» still compares the goods, not the cash.
      expect(after).toMatchObject({ refunded_cents: 22_123, status: 'refunded' });
    });

    it('does not round a refund to the card', async () => {
      const sale = await sell(down, [{ method: 'card', amount_cents: 22_123 }]);
      const after = await refundSale({
        storeId: store.storeId,
        saleId: sale!.id,
        staffId: store.sellerId,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
        method: 'card',
        cash_rounding: 50,
      });
      expect(after!.refunds[0]).toMatchObject({ cash_rounding: 0, rounding_cents: 0 });
    });
  });

  describe('an exchange', () => {
    it('rounds each half by itself', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 22_100 }], 50);
      const ids = await exchangeSale({
        storeId: store.storeId,
        staffId: store.sellerId,
        saleId: sale!.id,
        refund: {
          items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
          method: 'cash',
          reason_code: 'size',
          client_uuid: crypto.randomUUID(),
        },
        sale: {
          items: [{ variant_id: up, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 22_150 }],
          client_uuid: crypto.randomUUID(),
        },
        cash_rounding: 50,
      });
      const original = await getSale(store.storeId, sale!.id);
      const fresh = await getSale(store.storeId, ids.newSaleId);
      expect(original!.refunds[0]).toMatchObject({ total_cents: 22_123, rounding_cents: -23 });
      expect(fresh).toMatchObject({ total_cents: 22_130, rounding_cents: 20 });
    });
  });

  describe("the owner's summary", () => {
    it('reports the rounding and the payment split adds up to takings plus rounding', async () => {
      const summary = await getSalesSummary(store.storeId, { from: today(), to: today() });
      const paid = summary.payments.reduce((sum, p) => sum + p.amount_cents, 0);
      // The split counts the window's sales, so it reconciles with their rounding.
      expect(paid).toBe(summary.gross_cents + summary.rounding_cents);

      const sales = await pool.query(
        `SELECT COALESCE(SUM(rounding_cents), 0)::int AS r FROM pos_sales WHERE store_id = $1 AND status <> 'voided'`,
        [store.storeId]
      );
      const refunds = await pool.query(
        `SELECT COALESCE(SUM(rounding_cents), 0)::int AS r FROM pos_refunds WHERE store_id = $1`,
        [store.storeId]
      );
      expect(summary.rounding_cents).toBe(Number(sales.rows[0].r));
      expect(summary.refund_rounding_cents).toBe(Number(refunds.rows[0].r));
      expect(summary.rounding_cents).not.toBe(0);
      expect(summary.refund_rounding_cents).toBe(-46);
    });
  });

  describe('routes', () => {
    it('rounds a sale rung through /sales/complete', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: {
          items: [{ variant_id: down, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 22_100 }],
          cash_rounding: 50,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ total_cents: 22_123, cash_rounding: 50, rounding_cents: -23 });
    });

    it('answers an unknown step with a 400 the cashier can read', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/sales/complete',
        headers: auth(store.sellerToken),
        payload: {
          items: [{ variant_id: down, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 50_000 }],
          cash_rounding: 25,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/крок заокруглення/);
    });

    it('rounds a cash refund through /sales/:id/refund', async () => {
      const sale = await sell(down, [{ method: 'cash', amount_cents: 22_100 }], 50);
      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/sales/${sale!.id}/refunds`,
        headers: auth(store.sellerToken),
        payload: {
          items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
          method: 'cash',
          cash_rounding: 50,
          client_uuid: crypto.randomUUID(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().refunds[0]).toMatchObject({ total_cents: 22_123, rounding_cents: -23 });
    });

    it("lets the owner set the step and refuses one the law does not know", async () => {
      const bad = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { cash_rounding: 25 },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toMatch(/0, 10 або 50/);

      const seller = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.sellerToken),
        payload: { cash_rounding: 50 },
      });
      expect(seller.statusCode).toBe(403);

      const ok = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(store.ownerToken),
        payload: { cash_rounding: 50 },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().cash_rounding).toBe(50);
    });

    it('sends the step with the login, so an offline till rounds the same way', async () => {
      await pool.query(`UPDATE pos_stores SET cash_rounding = 50 WHERE id = $1`, [store.storeId]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/owner/login',
        payload: { login: store.ownerLogin, password: store.ownerPassword, store_slug: store.slug },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().store.cash_rounding).toBe(50);
    });
  });
});
