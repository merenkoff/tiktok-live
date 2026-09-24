// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Оплата» on the owner's «Сьогодні»: a cash payment is stored as what the
// customer handed over (the receipt prints the change from it), so the summary
// must take the change off — a 250 ₴ sale paid with a 500 ₴ note is 250 ₴ of
// cash takings, not 500.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { completeSale } from '../pos/sales.service.js';
import { getSalesSummary } from '../pos/analytics.service.js';
import { applyPosMigrations, createTestStore, dropTestStore, seedProduct } from './helpers/pos-fixtures.js';

let storeId: number;
let staffId: number;
let variantId: number;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

beforeAll(async () => {
  await applyPosMigrations();
  const store = await createTestStore('cash_change');
  storeId = store.storeId;
  staffId = store.sellerId;
  variantId = (await seedProduct(storeId, { priceCents: 25_000, quantity: 100 })).variantId;
});

afterAll(async () => {
  await dropTestStore(storeId);
});

async function payments(): Promise<Record<string, number>> {
  const summary = await getSalesSummary(storeId, { from: today(), to: today() });
  return Object.fromEntries(summary.payments.map((p) => [p.method, p.amount_cents]));
}

describe('sales summary — cash change', () => {
  it('counts only the cash a sale kept, not the note it was paid with', async () => {
    const sale = await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 50_000 }],
    });
    // What is stored stays what was handed over — the receipt needs it.
    const stored = await pool.query(`SELECT amount_cents FROM pos_payments WHERE sale_id = $1`, [sale.id]);
    expect(Number(stored.rows[0].amount_cents)).toBe(50_000);

    expect(await payments()).toEqual({ cash: 25_000 });
  });

  it('takes the change of a mixed over-payment off the cash, never off the card', async () => {
    // 250 ₴: 100 ₴ by card, a 200 ₴ note in cash → 50 ₴ change.
    await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [
        { method: 'card', amount_cents: 10_000 },
        { method: 'cash', amount_cents: 20_000 },
      ],
    });
    expect(await payments()).toEqual({ cash: 25_000 + 15_000, card: 10_000 });
  });

  it('leaves an exact payment as it is, so the split adds up to the takings', async () => {
    await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'card', amount_cents: 25_000 }],
    });
    const summary = await getSalesSummary(storeId, { from: today(), to: today() });
    const paid = summary.payments.reduce((sum, p) => sum + p.amount_cents, 0);
    expect(paid).toBe(summary.gross_cents);
    expect(await payments()).toEqual({ cash: 40_000, card: 35_000 });
  });
});
