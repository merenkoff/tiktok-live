// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Популярні товари» on the owner's «Сьогодні»: the revenue of a line is what
// the line brought in — after its share of the cart discount and net of what
// was refunded against it — so the five rows add up to «Чистими». It used to
// be quantity × list price, which overstated every receipt with a discount
// (TechDocs/POS_CLOTHING.md, D6).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import { getSalesSummary } from '../pos/analytics.service.js';
import { applyPosMigrations, createTestStore, dropTestStore, seedProduct } from './helpers/pos-fixtures.js';

let storeId: number;
let staffId: number;
let coat: number;
let cap: number;
let scarf: number;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

async function topItems() {
  const summary = await getSalesSummary(storeId, { from: today(), to: today() });
  const byName = Object.fromEntries(summary.top_items.map((i) => [i.product_name, i]));
  return { summary, byName };
}

beforeAll(async () => {
  await applyPosMigrations();
  const store = await createTestStore('top_items');
  storeId = store.storeId;
  staffId = store.sellerId;
  coat = (await seedProduct(storeId, { name: 'Пальто', priceCents: 100_000, quantity: 10 })).variantId;
  cap = (await seedProduct(storeId, { name: 'Кепка', priceCents: 50_000, quantity: 10 })).variantId;
  // Marked down 600 → 450: a line with a product discount takes no share of
  // the cart discount (POS_DISCOUNTS_AND_CUSTOMERS.md), and its revenue is the
  // marked-down price, not the old one.
  scarf = (await seedProduct(storeId, { name: 'Шарф', priceCents: 45_000, quantity: 10 })).variantId;
  await pool.query(`UPDATE pos_variants SET compare_at_cents = 60_000 WHERE id = $1`, [scarf]);
});

afterAll(async () => {
  await dropTestStore(storeId);
});

describe('sales summary — top items revenue', () => {
  it('counts a line after its share of the cart discount, so the rows add up to the net takings', async () => {
    // 2 × 1000 + 500 = 2500, minus 10 % → 2250: the coat line is 1800, the cap 450.
    await completeSale({
      storeId,
      staffId,
      items: [
        { variant_id: coat, quantity: 2 },
        { variant_id: cap, quantity: 1 },
      ],
      cart_discount: { type: 'percent', value: 10 },
      payments: [{ method: 'card', amount_cents: 225_000 }],
    });

    const { summary, byName } = await topItems();
    expect(byName['Пальто']).toMatchObject({ qty_sold: 2, revenue_cents: 180_000 });
    expect(byName['Кепка']).toMatchObject({ qty_sold: 1, revenue_cents: 45_000 });
    expect(summary.top_items.reduce((s, i) => s + i.revenue_cents, 0)).toBe(summary.net_cents);
  });

  it('reports a marked-down line at the price it sold for — which the cart discount leaves alone', async () => {
    await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: scarf, quantity: 1 }],
      cart_discount: { type: 'percent', value: 10 },
      payments: [{ method: 'cash', amount_cents: 45_000 }],
    });

    const { summary, byName } = await topItems();
    expect(byName['Шарф']).toMatchObject({ qty_sold: 1, revenue_cents: 45_000 });
    expect(summary.top_items.reduce((s, i) => s + i.revenue_cents, 0)).toBe(summary.net_cents);
  });

  it('takes a refund off at what the refund actually credited, not at the list price', async () => {
    // A second coat sale, then one of its two coats comes back: the refund
    // credits half of the DISCOUNTED line (900), so the row keeps 900 — had it
    // been priced at 1000 a unit, the row would read 800 and the rows would no
    // longer add up to the net takings.
    const sale = await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: coat, quantity: 2 }],
      cart_discount: { type: 'percent', value: 10 },
      payments: [{ method: 'card', amount_cents: 180_000 }],
    });
    const line = sale.items.find((i) => i.variant_id === coat)!;
    await refundSale({ storeId, saleId: sale.id, staffId, items: [{ sale_item_id: line.id, quantity: 1 }] });

    const { summary, byName } = await topItems();
    // 1800 (first sale) + 1800 − 900 (this one) over 2 + 1 coats.
    expect(byName['Пальто']).toMatchObject({ qty_sold: 3, revenue_cents: 270_000 });
    expect(summary.top_items.reduce((s, i) => s + i.revenue_cents, 0)).toBe(summary.net_cents);
  });
});
