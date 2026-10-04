// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receipt search (clothing R3): one box takes a receipt number or its
// digits, a product's name / caption / barcode / article, the customer's name
// or phone digits, or the fiscal number — and the day window is the STORE's
// calendar. Paged with offset; the answer stays a plain array.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { completeSale, listSales } from '../pos/sales.service.js';
import { createCustomer } from '../pos/customers.service.js';
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
const yesterday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(Date.now() - 86_400_000));

describe.skipIf(!hasDb)('receipt search', () => {
  let store: TestStore;
  let storeId: number;
  let coatSale: number;
  let capSale: number;
  let oldSale: number;
  let capNumber: string;

  const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id).sort((a, b) => a - b);

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('sale_search');
    storeId = store.storeId;
    const coat = await seedProduct(storeId, {
      name: 'Пальто вовняне',
      priceCents: 100_000,
      quantity: 10,
      barcode: '4820000000011',
      sku: 'PLT-1',
    });
    const cap = await seedProduct(storeId, {
      name: 'Кепка',
      priceCents: 50_000,
      quantity: 10,
      barcode: '4820000000028',
      sku: 'CAP-9',
      attributes: { size: 'L', color: 'червоний' },
    });
    const customer = await createCustomer(storeId, { name: 'Олена Коваль', phone: '+380671234567' });

    const s1 = await completeSale({
      storeId,
      staffId: store.sellerId,
      items: [{ variant_id: coat.variantId, quantity: 1 }],
      payments: [{ method: 'card', amount_cents: 100_000 }],
      customer_id: customer.id,
    });
    coatSale = s1.id;
    const s2 = await completeSale({
      storeId,
      staffId: store.sellerId,
      items: [{ variant_id: cap.variantId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 50_000 }],
    });
    capSale = s2.id;
    capNumber = s2.receipt_number;
    const s3 = await completeSale({
      storeId,
      staffId: store.sellerId,
      items: [
        { variant_id: coat.variantId, quantity: 1 },
        { variant_id: cap.variantId, quantity: 2 },
      ],
      payments: [{ method: 'card', amount_cents: 200_000 }],
    });
    oldSale = s3.id;
    // Rung yesterday, from the store's point of view and anyone else's.
    await pool.query(`UPDATE pos_sales SET created_at = created_at - INTERVAL '1 day' WHERE id = $1`, [oldSale]);
    // The cap's receipt was fiscalised.
    await pool.query(
      `INSERT INTO pos_fiscal_receipts
         (store_id, doc_type, sale_id, provider, status, provider_request_id, fiscal_code, total_cents)
       VALUES ($1, 'sale', $2, 'checkbox', 'done', gen_random_uuid(), 'ФН-7777', 50000)`,
      [storeId, capSale]
    );
  });

  afterAll(async () => {
    await dropTestStore(storeId);
  });

  it('lists everything newest first when nothing is asked', async () => {
    const rows = await listSales(storeId);
    expect(rows.map((r) => r.id)).toEqual([capSale, coatSale, oldSale]);
  });

  it('finds a receipt by its whole number and by the digits alone — the tail, not a fragment', async () => {
    expect(ids(await listSales(storeId, { q: capNumber }))).toEqual([capSale]);
    const digits = String(Number(capNumber.replace(/\D/g, '')));
    expect(ids(await listSales(storeId, { q: digits }))).toEqual([capSale]);
    expect(ids(await listSales(storeId, { q: capNumber.toLowerCase() }))).toEqual([capSale]);
  });

  it('finds receipts by a product name, a variant caption, an article and a scanned barcode', async () => {
    expect(ids(await listSales(storeId, { q: 'пальто' }))).toEqual([coatSale, oldSale]);
    expect(ids(await listSales(storeId, { q: 'червоний' }))).toEqual([capSale, oldSale]);
    expect(ids(await listSales(storeId, { q: 'cap-9' }))).toEqual([capSale, oldSale]);
    expect(ids(await listSales(storeId, { q: '4820000000028' }))).toEqual([capSale, oldSale]);
    // A barcode is matched whole: its fragment is nobody's receipt.
    expect(ids(await listSales(storeId, { q: '482000000002' }))).toEqual([]);
  });

  it('finds receipts by the customer\'s name and by the digits of their phone', async () => {
    expect(ids(await listSales(storeId, { q: 'коваль' }))).toEqual([coatSale]);
    expect(ids(await listSales(storeId, { q: '0671234' }))).toEqual([coatSale]);
    expect(ids(await listSales(storeId, { q: '+38067' }))).toEqual([coatSale]);
  });

  it('finds a receipt by the fiscal number ПРРО gave it', async () => {
    expect(ids(await listSales(storeId, { q: 'ФН-7777' }))).toEqual([capSale]);
  });

  it('treats % and _ as characters and finds nothing for nonsense', async () => {
    expect(ids(await listSales(storeId, { q: '%' }))).toEqual([]);
    expect(ids(await listSales(storeId, { q: 'немає такого' }))).toEqual([]);
  });

  it('cuts the window on the store\'s calendar days, inclusive', async () => {
    expect(ids(await listSales(storeId, { from: today(), to: today() }))).toEqual([coatSale, capSale]);
    expect(ids(await listSales(storeId, { to: yesterday() }))).toEqual([oldSale]);
    expect(ids(await listSales(storeId, { from: yesterday(), q: 'кепка' }))).toEqual([capSale, oldSale]);
  });

  it('pages with offset in the same newest-first order', async () => {
    const first = await listSales(storeId, { limit: 1 });
    const second = await listSales(storeId, { limit: 1, offset: 1 });
    const third = await listSales(storeId, { limit: 1, offset: 2 });
    expect([first[0]!.id, second[0]!.id, third[0]!.id]).toEqual([capSale, coatSale, oldSale]);
    expect(await listSales(storeId, { limit: 1, offset: 3 })).toEqual([]);
  });

  describe('route', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildPosTestApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('passes the search and the window through for a cashier', async () => {
      const byText = await app.inject({
        method: 'GET',
        url: `/api/pos/sales?q=${encodeURIComponent('коваль')}`,
        headers: auth(store.sellerToken),
      });
      expect(byText.statusCode).toBe(200);
      expect(ids(byText.json())).toEqual([coatSale]);

      const byDay = await app.inject({
        method: 'GET',
        url: `/api/pos/sales?from=${today()}&to=${today()}&limit=10&offset=1`,
        headers: auth(store.sellerToken),
      });
      expect(byDay.statusCode).toBe(200);
      expect(ids(byDay.json())).toEqual([coatSale]);
    });

    it('refuses a day that is not one, in words', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/sales?from=2026-13-40',
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/РРРР-ММ-ДД/);
    });
  });
});
