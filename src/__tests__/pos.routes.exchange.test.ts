// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.exchange.test.ts — `POST /sales/:id/exchange` in a
// store that does not fiscalise: the body shape, the refusals in the cashier's
// words, and the idempotency contract (a replay answers 200 with the same two
// documents; two identical requests at once make one exchange).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
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
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POST /sales/:id/exchange', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let coat = 0;
  let tee = 0;
  let hat = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rexch');
    app = await buildPosTestApp();
    coat = (await seedProduct(store.storeId, { name: 'Пальто', priceCents: 50000, quantity: 50 })).variantId;
    tee = (await seedProduct(store.storeId, { name: 'Футболка', priceCents: 30000, quantity: 50 })).variantId;
    hat = (await seedProduct(store.storeId, { name: 'Шапка', priceCents: 70000, quantity: 50 })).variantId;
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api/pos${url}`, headers: auth(store.sellerToken), payload });

  const sellCoat = async (method: 'cash' | 'card' = 'cash') => {
    const res = await post('/sales/complete', {
      items: [{ variant_id: coat, quantity: 1 }],
      payments: [{ method, amount_cents: 50000 }],
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  };

  const body = (sale: { items: { id: number }[] }, newVariant: number, newPrice: number, over: Record<string, unknown> = {}) => ({
    refund: {
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      reason_code: 'size',
      client_uuid: randomUUID(),
    },
    sale: {
      items: [{ variant_id: newVariant, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: newPrice }],
      client_uuid: randomUUID(),
    },
    ...over,
  });

  it('answers 201 with both documents and the difference — the customer pays it', async () => {
    const sale = await sellCoat();
    const res = await post(`/sales/${sale.id}/exchange`, body(sale, hat, 70000));
    expect(res.statusCode).toBe(201);
    const view = res.json();
    expect(view.difference_cents).toBe(20000);
    expect(view.refund.id).toBe(sale.id);
    expect(view.refund.status).toBe('refunded');
    expect(view.refund.refund_id).toEqual(expect.any(Number));
    expect(view.refund.refund_fiscal).toBeNull();
    expect(view.refund.refunds[0]).toMatchObject({
      id: view.refund.refund_id,
      reason_code: 'size',
      method: 'cash',
      exchange_sale: { id: view.sale.id, receipt_number: view.sale.receipt_number, status: 'completed' },
    });
    expect(view.sale.total_cents).toBe(70000);
    expect(view.sale.exchange_of).toMatchObject({
      refund_id: view.refund.refund_id,
      receipt_number: sale.receipt_number,
      refund_total_cents: 50000,
    });
  });

  it('reads the difference the other way round, and as zero', async () => {
    const cheaper = await sellCoat();
    const down = await post(`/sales/${cheaper.id}/exchange`, body(cheaper, tee, 30000));
    expect(down.statusCode).toBe(201);
    expect(down.json().difference_cents).toBe(-20000);

    const same = await sellCoat();
    const even = await post(`/sales/${same.id}/exchange`, body(same, coat, 50000));
    expect(even.statusCode).toBe(201);
    expect(even.json().difference_cents).toBe(0);
  });

  it('refuses in the cashier\'s words and writes nothing', async () => {
    const sale = await sellCoat('card');

    const noUuid = await post(`/sales/${sale.id}/exchange`, {
      ...body(sale, tee, 30000),
      sale: { items: [{ variant_id: tee, quantity: 1 }], payments: [{ method: 'card', amount_cents: 30000 }] },
    });
    expect(noUuid.statusCode).toBe(400);
    expect(noUuid.json().error).toContain('client_uuid обовʼязковий для обміну');

    const cash = await post(`/sales/${sale.id}/exchange`, body(sale, tee, 30000));
    expect(cash.statusCode).toBe(400);
    expect(cash.json().error).toBe('Чек оплачено карткою — повернення теж на картку');

    const short = await post(`/sales/${sale.id}/exchange`, {
      ...body(sale, hat, 70000),
      refund: { items: [{ sale_item_id: sale.items[0].id, quantity: 1 }], method: 'card', client_uuid: randomUUID() },
      sale: { items: [{ variant_id: hat, quantity: 1 }], payments: [{ method: 'card', amount_cents: 1000 }], client_uuid: randomUUID() },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe('Insufficient payment');

    const gone = await post(`/sales/999999999/exchange`, body(sale, tee, 30000));
    expect(gone.statusCode).toBe(404);

    const detail = await app.inject({ method: 'GET', url: `/api/pos/sales/${sale.id}`, headers: auth(store.sellerToken) });
    expect(detail.json().refunds).toHaveLength(0);
    expect(detail.json().status).toBe('completed');
  });

  it('answers a replay with 200 and the very same two documents', async () => {
    const sale = await sellCoat();
    const payload = body(sale, tee, 30000);
    const first = await post(`/sales/${sale.id}/exchange`, payload);
    expect(first.statusCode).toBe(201);
    const again = await post(`/sales/${sale.id}/exchange`, payload);
    expect(again.statusCode).toBe(200);
    expect(again.json().refund.refund_id).toBe(first.json().refund.refund_id);
    expect(again.json().sale.id).toBe(first.json().sale.id);
    expect(again.json().difference_cents).toBe(-20000);

    const refunds = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_refunds WHERE sale_id = $1`, [sale.id]);
    expect(refunds.rows[0].n).toBe(1);
  });

  it('makes one exchange out of two identical requests sent at once', async () => {
    const sale = await sellCoat();
    const payload = body(sale, tee, 30000);
    const [a, b] = await Promise.all([
      post(`/sales/${sale.id}/exchange`, payload),
      post(`/sales/${sale.id}/exchange`, payload),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().sale.id).toBe(b.json().sale.id);
    const sales = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pos_sales WHERE exchange_refund_id = $1`,
      [a.json().refund.refund_id]
    );
    expect(sales.rows[0].n).toBe(1);
  });

  it('keeps the exchange badges on the receipts list', async () => {
    const sale = await sellCoat();
    const res = await post(`/sales/${sale.id}/exchange`, body(sale, tee, 30000));
    expect(res.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/api/pos/sales?limit=5', headers: auth(store.sellerToken) });
    const rows = list.json() as Array<Record<string, unknown>>;
    const fresh = rows.find((r) => r.id === res.json().sale.id)!;
    const original = rows.find((r) => r.id === sale.id)!;
    expect(fresh.exchange_of_receipt_number).toBe(sale.receipt_number);
    expect(original.exchange_sale_number).toBe(res.json().sale.receipt_number);
  });
});
