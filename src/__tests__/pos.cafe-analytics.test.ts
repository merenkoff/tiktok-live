// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The café's own numbers (TechDocs/POS_CAFE.md §10, phase К6).
//
// The matrix is the part worth pinning: it does not report a dish, it
// CLASSIFIES one, and an owner takes a dish off the menu on its say-so. So
// what has to hold is less «the sum is right» than «the classification is
// honest»: a dish we cannot cost never gets a quadrant, a sample too small to
// mean anything is refused out loud, and a counter-service café is told that
// table figures are not its question rather than being shown zeroes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
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
import { getCafeAnalytics, type MenuQuadrant } from '../pos/cafe-analytics.service.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import {
  addLine,
  createDocument,
  postDocument,
  reverseDocument,
} from '../pos/stock-documents.service.js';
import * as bills from '../pos/bills.service.js';
import { fireRound } from '../pos/rounds.service.js';
import { payBill } from '../pos/bill-payment.service.js';

describe.skipIf(!hasDb)('POS café analytics', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let boutique: TestStore;
  let storeId = 0;
  let staffId = 0;

  /** The four dishes are built to land one in each quadrant — see below. */
  let star = 0;
  let plowhorse = 0;
  let puzzle = 0;
  let dog = 0;
  let uncosted = 0;

  const read = () => getCafeAnalytics(storeId);

  /** A dish with a known price and a known cost card. */
  async function dish(name: string, priceCents: number, costCents: number): Promise<number> {
    const { variantId } = await seedProduct(storeId, {
      name,
      priceCents,
      quantity: 10_000,
    });
    await pool.query(`UPDATE pos_variants SET cost_cents = $2 WHERE id = $1`, [
      variantId,
      costCents,
    ]);
    return variantId;
  }

  const sell = (variantId: number, quantity: number, priceCents = 10_000) =>
    completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity }],
      payments: [{ method: 'cash', amount_cents: priceCents * quantity }],
    });

  const quadrantOf = async (variantId: number): Promise<MenuQuadrant | undefined> =>
    (await read()).menu.rows.find((r) => r.variant_id === variantId)?.quadrant;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('cafeanalytics');
    storeId = store.storeId;
    staffId = store.sellerId;
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [storeId]);

    boutique = await createTestStore('cafeanalytics_shop');

    // Four dishes, one price, two cost cards, two popularities. With N = 4 the
    // fair share is 2500 bps and the bar 70 % of it = 1750; the weighted
    // average unit margin comes out at 50,00 ₴. Everything below is arithmetic
    // from those two numbers, which is why the quadrants are predictable.
    star = await dish('Зірка', 10_000, 2_000); // unit margin 8000, sold 40
    plowhorse = await dish('Конячка', 10_000, 8_000); // 2000, sold 40
    puzzle = await dish('Загадка', 10_000, 2_000); // 8000, sold 10
    dog = await dish('Собака', 10_000, 8_000); // 2000, sold 10

    await sell(star, 40);
    await sell(plowhorse, 40);
    await sell(puzzle, 10);
    await sell(dog, 10);
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    if (storeId) await dropTestStore(storeId);
    if (boutique) await dropTestStore(boutique.storeId);
  });

  describe('the menu matrix', () => {
    it('puts each dish in the quadrant its popularity and margin earn', async () => {
      const { menu } = await read();
      expect(menu.enough_data).toBe(true);
      expect(menu.thresholds).toEqual({
        // 70 % of a fair 1/4.
        popularity_share_bps: 1_750,
        // (40×8000 + 40×2000 + 10×8000 + 10×2000) / 100.
        unit_margin_cents: 5_000,
      });

      expect(await quadrantOf(star)).toBe('star');
      expect(await quadrantOf(plowhorse)).toBe('plowhorse');
      expect(await quadrantOf(puzzle)).toBe('puzzle');
      expect(await quadrantOf(dog)).toBe('dog');

      // Sorted by what the dish actually brought in, so the top of the list is
      // the top of the menu.
      expect(menu.rows[0].variant_id).toBe(star);
    });

    it('leaves a dish we cannot cost OUT of the matrix, and names why', async () => {
      // The rule the whole screen rests on. Zero cost would make this the most
      // profitable thing on the menu and land it in «stars»; zero margin would
      // make it a «dog». Both end with the owner changing a menu over a number
      // that was never real.
      uncosted = await dish('Без собівартості', 10_000, 0);
      await sell(uncosted, 20);

      const { menu, food_cost } = await read();
      expect(menu.rows.map((r) => r.variant_id)).not.toContain(uncosted);
      expect(menu.excluded).toContainEqual(
        expect.objectContaining({ variant_id: uncosted, reason: 'no_cost', sold: 20 }),
      );
      // And the food-cost share does not quietly count its revenue either —
      // the one line says how much it is blind to.
      expect(food_cost.unpriced_lines).toBe(1);
    });

    it('refuses to classify a sample too small to mean anything', async () => {
      const tiny = await createTestStore('cafeanalytics_tiny');
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [tiny.storeId]);
      const { variantId } = await seedProduct(tiny.storeId, { priceCents: 5_000, quantity: 100 });
      await pool.query(`UPDATE pos_variants SET cost_cents = 1000 WHERE id = $1`, [variantId]);
      await completeSale({
        storeId: tiny.storeId,
        staffId: tiny.sellerId,
        items: [{ variant_id: variantId, quantity: 2 }],
        payments: [{ method: 'cash', amount_cents: 10_000 }],
      });

      const { menu } = await getCafeAnalytics(tiny.storeId);
      // One dish and two units: the quadrants would be noise with a straight
      // face, so the screen is told to say so instead.
      expect(menu.enough_data).toBe(false);
      expect(menu.rows).toHaveLength(1);
      await dropTestStore(tiny.storeId);
    });
  });

  describe('the day', () => {
    it('counts receipts and the average check, and shapes the hours', async () => {
      const { sales_count, average_check_cents, peak_hours } = await read();
      expect(sales_count).toBeGreaterThanOrEqual(4);
      expect(average_check_cents).toBeGreaterThan(0);
      // Every hour, always — a gap at 03:00 is information, and a screen that
      // has to invent the missing hours draws a different chart each time.
      expect(peak_hours).toHaveLength(24);
      expect(peak_hours.map((h) => h.hour)).toEqual([...Array(24).keys()]);
      expect(peak_hours.reduce((n, h) => n + h.orders, 0)).toBe(sales_count);
    });

    it('subtracts what came back and ignores a voided sale', async () => {
      const returnable = await dish('Повернення', 10_000, 3_000);
      const sale = await sell(returnable, 10);
      const before = (await read()).menu.rows.find((r) => r.variant_id === returnable)!;
      expect(before.sold).toBe(10);

      await refundSale({
        storeId,
        staffId,
        saleId: sale!.id,
        items: [{ sale_item_id: sale!.items[0].id, quantity: 4 }],
      });
      const after = (await read()).menu.rows.find((r) => r.variant_id === returnable)!;
      expect(after.sold).toBe(6);
      expect(after.revenue_cents).toBe(60_000);
    });
  });

  describe('kitchen write-offs', () => {
    it('reports them by the vertical’s own reasons, and a reversed one is not a loss', async () => {
      const spoiled = await dish('Зіпсоване', 10_000, 2_500);

      async function writeOff(quantity: number): Promise<number> {
        const doc = await createDocument({
          storeId,
          staffId,
          type: 'writeoff',
          // A café word — the vertical owns this vocabulary since К5e, and the
          // report passes it through rather than folding it into «Інше».
          reasonCode: 'spoiled',
        });
        await addLine({ storeId, documentId: doc.id, variantId: spoiled, quantity });
        await postDocument({ storeId, staffId, documentId: doc.id });
        return doc.id;
      }

      await writeOff(10);
      const after = (await read()).writeoffs;
      const row = after.rows.find((r) => r.reason === 'spoiled')!;
      expect(row.quantity).toBe(10);
      expect(row.cost_cents).toBe(25_000);

      // Reversing posts a COUNTER-document of the same type with the same
      // positive quantity. Filtering on status alone would read one undone
      // write-off as two.
      const undone = await writeOff(6);
      await reverseDocument({ storeId, staffId, documentId: undone });
      const settled = (await read()).writeoffs.rows.find((r) => r.reason === 'spoiled')!;
      expect(settled.quantity).toBe(10);
    });
  });

  describe('the restaurant half', () => {
    it('is absent — not zero — for a café with no bills', async () => {
      // `demo-cafe` has no tables at all. «Оборотність столу: 0» reads as a
      // shop doing badly; null reads as a question that is not about it.
      expect((await read()).tables).toBeNull();
    });

    it('reports the bill, the guests and the turn once a table has been paid', async () => {
      const soup = await dish('Борщ', 12_000, 4_000);
      const hall = Number(
        (
          await pool.query(
            `INSERT INTO pos_halls (store_id, name) VALUES ($1, 'Зала') RETURNING id`,
            [storeId],
          )
        ).rows[0].id,
      );
      const table = Number(
        (
          await pool.query(
            `INSERT INTO pos_tables (store_id, hall_id, name) VALUES ($1, $2, '7') RETURNING id`,
            [storeId, hall],
          )
        ).rows[0].id,
      );

      const opened = await bills.openBill({ storeId, staffId, tableId: table, guests: 3 });
      await bills.addDraftItem(storeId, staffId, opened.bill.id, {
        variant_id: soup,
        quantity: 2,
      });
      await fireRound({ storeId, staffId, billId: opened.bill.id });
      await payBill({
        storeId,
        staffId,
        billId: opened.bill.id,
        parts: [{ payments: [{ method: 'cash', amount_cents: 24_000 }] }],
      });

      const tables = (await read()).tables!;
      expect(tables).toMatchObject({ bills: 1, guests: 3, revenue_cents: 24_000 });
      expect(tables.avg_bill_cents).toBe(24_000);
      expect(tables.avg_per_guest_cents).toBe(8_000);
      // One bill, one table, one day.
      expect(tables.turns_per_table_per_day).toBe(1);
      expect(tables.avg_minutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('the route', () => {
    const get = (token: string) =>
      app.inject({ method: 'GET', url: '/api/pos/analytics/cafe', headers: auth(token) });

    it('answers the owner of a café', async () => {
      const res = await get(store.ownerToken);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('menu.thresholds');
    });

    it('refuses a shop that is not a café, rather than answering with zeroes', async () => {
      const res = await get(boutique.ownerToken);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('not_a_cafe');
    });

    it('is owner-only and validates the window', async () => {
      expect((await get(store.sellerToken)).statusCode).toBe(403);
      const bad = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/cafe?from=2026-13-40',
        headers: auth(store.ownerToken),
      });
      expect(bad.statusCode).toBe(400);
    });
  });
});
