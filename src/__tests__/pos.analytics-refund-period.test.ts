// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Сьогодні» and the period summary count a refund on the day it HAPPENED.
//
// A single-tax payer's income drops in the period of the return (ПКУ п. 292.11
// пп. 5), so a coat sold in March and brought back in April is April's minus,
// not a rewrite of March. The summary used to subtract `pos_sales.refunded_cents`
// by the sale's day, which did exactly that rewrite.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import { getSalesSummary } from '../pos/analytics.service.js';
import { applyPosMigrations, createTestStore, dropTestStore, hasDb, seedProduct } from './helpers/pos-fixtures.js';

const TZ = 'Europe/Kyiv';
const dayOf = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);

describe.skipIf(!hasDb)('sales summary — refunds by the day of the refund', () => {
  let storeId: number;
  let staffId: number;
  let variantId: number;
  const today = dayOf(new Date());
  // Two days back rather than one: a test that runs at 00:10 Kyiv time must
  // not find «yesterday» on the wrong side of midnight.
  const earlier = dayOf(new Date(Date.now() - 2 * 86_400_000));

  beforeAll(async () => {
    await applyPosMigrations();
    const store = await createTestStore('refund_period');
    storeId = store.storeId;
    staffId = store.sellerId;
    variantId = (await seedProduct(storeId, { priceCents: 40_000, quantity: 100 })).variantId;

    const sale = (await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 2 }],
      payments: [{ method: 'cash', amount_cents: 80_000 }],
    }))!;
    await pool.query(`UPDATE pos_sales SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1`, [sale.id]);
    await refundSale({
      storeId,
      saleId: sale.id,
      staffId,
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method: 'cash',
      client_uuid: randomUUID(),
    });
  });

  afterAll(async () => {
    await dropTestStore(storeId);
  });

  it('puts the refund on the day it was made, not on the receipt\'s day', async () => {
    const refundDay = await getSalesSummary(storeId, { from: today, to: today, timezone: TZ });
    expect(refundDay.sales_count).toBe(0);
    expect(refundDay.gross_cents).toBe(0);
    expect(refundDay.refunded_cents).toBe(40_000);
    expect(refundDay.net_cents).toBe(-40_000);

    const saleDay = await getSalesSummary(storeId, { from: earlier, to: earlier, timezone: TZ });
    expect(saleDay.sales_count).toBe(1);
    expect(saleDay.gross_cents).toBe(80_000);
    expect(saleDay.refunded_cents).toBe(0);
    expect(saleDay.net_cents).toBe(80_000);
  });

  it('adds up over a window that holds both days, day by day', async () => {
    const range = await getSalesSummary(storeId, { from: earlier, to: today, timezone: TZ });
    expect(range.gross_cents).toBe(80_000);
    expect(range.refunded_cents).toBe(40_000);
    expect(range.net_cents).toBe(40_000);

    const byDate = Object.fromEntries(range.daily.map((d) => [d.date, d]));
    expect(byDate[earlier]).toMatchObject({ gross_cents: 80_000, refunded_cents: 0, net_cents: 80_000, sales_count: 1 });
    expect(byDate[today]).toMatchObject({ gross_cents: 0, refunded_cents: 40_000, net_cents: -40_000, sales_count: 0 });
    expect(range.daily.reduce((sum, d) => sum + d.net_cents, 0)).toBe(range.net_cents);
  });
});
