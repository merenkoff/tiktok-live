// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The florist's own numbers (`TechDocs/POS_FLORIST_BENCH.md` §13, phase B7).
//
// Every one of these is arithmetic over the real schema, so they run against
// it. What has to hold: a stem sold inside a bouquet counts as sold, a bouquet
// assembled in advance does not double-count its stems, cost follows the
// snapshot and not the current recipe, a return is subtracted, and a reversed
// write-off is not a loss.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { getFlowerAnalytics } from '../pos/flowers-analytics.service.js';
import { createProduct } from '../pos/products.service.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import {
  addLine,
  createDocument,
  postDocument,
  reverseDocument,
} from '../pos/stock-documents.service.js';

describe.skipIf(!hasDb)('POS florist analytics', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let storeId = 0;
  let staffId = 0;
  let roseId = 0;
  let eucalyptusId = 0;
  let derivedBouquetId = 0;

  const read = () => getFlowerAnalytics(storeId);
  const stemOf = async (variantId: number) =>
    (await read()).stems.find((row) => row.variant_id === variantId);

  /** Post a stock document of `type` with one line. */
  async function post(
    type: 'writeoff' | 'receipt',
    variantId: number,
    quantity: number,
    opts: { reason?: string; unitCostCents?: number } = {}
  ): Promise<number> {
    const doc = await createDocument({
      storeId,
      staffId,
      type,
      reasonCode: type === 'writeoff' ? (opts.reason ?? 'damaged') : null,
    });
    await addLine({
      storeId,
      documentId: doc.id,
      variantId,
      quantity,
      unitCostCents: opts.unitCostCents ?? null,
    });
    await postDocument({ storeId, documentId: doc.id, staffId });
    return doc.id;
  }

  const sell = (
    items: Array<{
      variant_id: number;
      quantity: number;
      components?: Array<{ component_variant_id: number; quantity: number }>;
    }>,
    amountCents: number
  ) =>
    completeSale({
      storeId,
      staffId,
      items,
      payments: [{ method: 'cash', amount_cents: amountCents }],
    });

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('flan');
    storeId = store.storeId;
    staffId = store.ownerId;
    await pool.query(
      `UPDATE pos_stores SET vertical = 'flowers', florist_labour_bps = 2500 WHERE id = $1`,
      [storeId]
    );

    // Costs matter here, unlike everywhere else: the whole margin half is
    // revenue against what the stems cost the shop.
    roseId = (await seedProduct(storeId, { name: 'Троянда', priceCents: 9000, quantity: 500 }))
      .variantId;
    eucalyptusId = (
      await seedProduct(storeId, { name: 'Евкаліпт', priceCents: 5500, quantity: 500 })
    ).variantId;
    await pool.query(`UPDATE pos_variants SET cost_cents = 4000 WHERE id = $1`, [roseId]);
    await pool.query(`UPDATE pos_variants SET cost_cents = 2000 WHERE id = $1`, [eucalyptusId]);

    const derived = await createProduct(storeId, {
      name: 'Букет «Весняний»',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 120000,
          quantity: 0,
          components: [
            { component_variant_id: roseId, quantity: 9 },
            { component_variant_id: eucalyptusId, quantity: 3 },
          ],
        },
      ],
    });
    derivedBouquetId = (derived!.variants[0] as { id: number }).id;
  }, 60000);

  beforeEach(async () => {
    // Each test states its own world: sales and documents from the previous one
    // would land in the same 30-day window and make every total a guess.
    await pool.query(
      `DELETE FROM pos_stock_documents WHERE store_id = $1 AND type IN ('writeoff','receipt')`,
      [storeId]
    );
    await pool.query(`DELETE FROM pos_sales WHERE store_id = $1`, [storeId]);
    await pool.query(`UPDATE pos_stock SET quantity = 500 WHERE store_id = $1`, [storeId]);
  });

  afterAll(async () => {
    await app.close();
    await dropTestStore(storeId);
    await pool.end();
  });

  // ── Що в смітнику ─────────────────────────────────────────────────────────

  it('counts what the bin cost, by reason', async () => {
    await post('writeoff', roseId, 10, { reason: 'damaged' });
    await post('writeoff', eucalyptusId, 5, { reason: 'gift' });

    const { loss } = await read();

    // 10 roses at 40.00 cost + 5 greens at 20.00 = 500.00
    expect(loss.total_cost_cents).toBe(10 * 4000 + 5 * 2000);
    expect(loss.by_reason).toEqual(
      expect.arrayContaining([
        { reason: 'damaged', quantity: 10, cost_cents: 40000 },
        { reason: 'gift', quantity: 5, cost_cents: 10000 },
      ])
    );
  });

  it('a write-off somebody took back is not a loss, and not a second one', async () => {
    // Both halves of the filter matter and it is easy to get half right:
    // `reverseDocument` marks the original `reversed` AND posts a
    // counter-document of the same type with the same positive quantities.
    // Filtering on status alone turns an undone write-off into two.
    const docId = await post('writeoff', roseId, 10, { reason: 'damaged' });
    expect((await read()).loss.total_cost_cents).toBe(40000);

    await reverseDocument({ storeId, documentId: docId, staffId });

    expect((await read()).loss.total_cost_cents).toBe(0);
  });

  it('reads the share of what came in, which is the number a florist buys on', async () => {
    // «З кожних десяти троянд дві в смітник» is a buying decision. «Списано 20
    // стебел» is not — it says nothing about whether that is a lot.
    await post('receipt', roseId, 100, { unitCostCents: 4000 });
    await post('writeoff', roseId, 20, { reason: 'damaged' });

    const row = (await read()).loss.top_variants.find((r) => r.variant_id === roseId);

    expect(row).toMatchObject({ written_off: 20, received: 100, waste_bps: 2000 });
  });

  it('says nothing rather than a wrong share when nothing came in', async () => {
    // Written off out of opening stock, with no delivery in the window: a
    // share here would divide by zero and read as 100% waste.
    await post('writeoff', roseId, 20, { reason: 'damaged' });

    const row = (await read()).loss.top_variants.find((r) => r.variant_id === roseId);

    expect(row?.waste_bps).toBeNull();
  });

  it('costs the bin from the variant’s cost card', async () => {
    // `addLine` stores `unit_cost_cents` on a receipt only, so a write-off line
    // never carries one and there is no lot costing to fall back on. What the
    // bin cost is therefore what the card says the stem costs today — worth
    // pinning, because it is the assumption the whole loss half rests on.
    await post('writeoff', roseId, 10, { reason: 'damaged', unitCostCents: 6000 });

    expect((await read()).loss.total_cost_cents).toBe(10 * 4000);
  });

  // ── Топ стебел ────────────────────────────────────────────────────────────

  it('counts a stem sold inside a bouquet, not just the bouquet card', async () => {
    // The core's top-items list counts sale lines, which for a florist is
    // mostly bouquet cards — a shop reading it would conclude nobody buys
    // roses. This is the half that only exists in the sale's own snapshot.
    await sell([{ variant_id: roseId, quantity: 4 }], 36000);
    // Priced by the server: 9 roses at 90.00 plus the shop's 25% = 1012.50 each.
    await sell(
      [
        {
          variant_id: derivedBouquetId,
          quantity: 2,
          components: [{ component_variant_id: roseId, quantity: 9 }],
        },
      ],
      202500
    );

    expect(await stemOf(roseId)).toMatchObject({ loose: 4, in_bouquets: 18, total: 22 });
  });

  it('does not count the stems of a bouquet assembled in advance', async () => {
    // Its stems left with the production document days ago. Counting them
    // again at the sale would report flowers leaving the fridge twice.
    const own = await createProduct(storeId, {
      name: 'Букет «Ніжність»',
      kind: 'composite',
      stock_mode: 'own',
      variants: [
        {
          attributes: {},
          price_cents: 90000,
          quantity: 0,
          components: [{ component_variant_id: roseId, quantity: 9 }],
        },
      ],
    });
    const ownId = (own!.variants[0] as { id: number }).id;
    await pool.query(`UPDATE pos_stock SET quantity = 5 WHERE variant_id = $1 AND store_id = $2`, [
      ownId,
      storeId,
    ]);

    await sell([{ variant_id: ownId, quantity: 1 }], 90000);

    expect(await stemOf(roseId)).toBeUndefined();
  });

  it('subtracts a stem that came back', async () => {
    const sale = await sell([{ variant_id: roseId, quantity: 10 }], 90000);
    const saleRow = await pool.query(
      `SELECT id FROM pos_sale_items WHERE sale_id = $1 AND variant_id = $2`,
      [sale!.id, roseId]
    );
    await refundSale({
      storeId,
      saleId: sale!.id,
      staffId,
      items: [{ sale_item_id: Number(saleRow.rows[0].id), quantity: 4 }],
      method: 'cash',
    });

    expect(await stemOf(roseId)).toMatchObject({ loose: 6, total: 6 });
  });

  it('leaves a voided sale out entirely', async () => {
    await sell([{ variant_id: roseId, quantity: 5 }], 45000);
    await pool.query(`UPDATE pos_sales SET status = 'voided' WHERE store_id = $1`, [storeId]);

    expect(await stemOf(roseId)).toBeUndefined();
  });

  // ── Реалізована націнка ───────────────────────────────────────────────────

  it('prices a bouquet at what its snapshot says went in', async () => {
    // 9 roses at 40.00 cost = 360.00; the bouquet sold for 1012.50 (the stems'
    // retail 810.00 plus the shop's 25%). Margin 652.50 over a 360.00 cost.
    await sell(
      [
        {
          variant_id: derivedBouquetId,
          quantity: 1,
          components: [{ component_variant_id: roseId, quantity: 9 }],
        },
      ],
      101250
    );

    const bouquet = (await read()).margin.rows.find((r) => r.kind === 'bouquet');

    expect(bouquet).toMatchObject({ lines: 1, revenue_cents: 101250, cost_cents: 36000 });
    expect(bouquet?.margin_cents).toBe(65250);
  });

  it('keeps bouquets apart from everything else, next to what the shop charges', async () => {
    // The comparison the screen exists for: `florist_labour_bps` is what the
    // shop charges for assembly; this is what it ended up earning.
    await sell([{ variant_id: roseId, quantity: 2 }], 18000);
    await sell(
      [
        {
          variant_id: derivedBouquetId,
          quantity: 1,
          components: [{ component_variant_id: eucalyptusId, quantity: 4 }],
        },
      ],
      27500
    );

    const { margin } = await read();

    expect(margin.labour_bps).toBe(2500);
    expect(margin.rows.map((r) => r.kind).sort()).toEqual(['bouquet', 'other']);
    const other = margin.rows.find((r) => r.kind === 'other');
    // 2 roses at 90.00 retail, 40.00 cost.
    expect(other).toMatchObject({ revenue_cents: 18000, cost_cents: 8000 });
    expect(margin.total_margin_cents).toBe(18000 - 8000 + (27500 - 8000));
  });

  it('reports no markup rather than a fake one when cost is unknown', async () => {
    const free = (await seedProduct(storeId, { name: 'Листівка', priceCents: 5000, quantity: 50 }))
      .variantId;
    await pool.query(`UPDATE pos_variants SET cost_cents = 0 WHERE id = $1`, [free]);
    await sell([{ variant_id: free, quantity: 1 }], 5000);

    const other = (await read()).margin.rows.find((r) => r.kind === 'other');
    expect(other?.cost_cents).toBe(0);
    expect(other?.markup_bps).toBeNull();
  });

  // ── Вікно ─────────────────────────────────────────────────────────────────

  it('covers a month by default, and every day of it', async () => {
    const { from, to, daily_loss } = await read();
    expect(daily_loss).toHaveLength(30);
    expect(daily_loss[0].date).toBe(from);
    expect(daily_loss[daily_loss.length - 1].date).toBe(to);
  });

  it('leaves out what happened before the window', async () => {
    const docId = await post('writeoff', roseId, 10, { reason: 'damaged' });
    await pool.query(
      `UPDATE pos_stock_documents SET occurred_at = NOW() - interval '90 days' WHERE id = $1`,
      [docId]
    );

    expect((await read()).loss.total_cost_cents).toBe(0);
  });

  // ── Over HTTP ─────────────────────────────────────────────────────────────

  it('is owner-only and refuses a shop that does not sell flowers', async () => {
    const asSeller = await app.inject({
      method: 'GET',
      url: '/api/pos/analytics/flowers',
      headers: auth(store.sellerToken),
    });
    expect(asSeller.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/pos/analytics/flowers',
      headers: auth(store.ownerToken),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toHaveProperty('stems');

    // A clothes shop asking this question gets told it is the wrong question,
    // not a screen of zeroes that reads as «нічого не списали».
    await pool.query(`UPDATE pos_stores SET vertical = 'clothing' WHERE id = $1`, [storeId]);
    try {
      const wrong = await app.inject({
        method: 'GET',
        url: '/api/pos/analytics/flowers',
        headers: auth(store.ownerToken),
      });
      expect(wrong.statusCode).toBe(409);
      expect(wrong.json().error).toBe('not_a_flower_shop');
    } finally {
      await pool.query(`UPDATE pos_stores SET vertical = 'flowers' WHERE id = $1`, [storeId]);
    }
  });

  it('refuses a range that is backwards or absurd', async () => {
    const backwards = await app.inject({
      method: 'GET',
      url: '/api/pos/analytics/flowers?from=2026-09-30&to=2026-09-01',
      headers: auth(store.ownerToken),
    });
    expect(backwards.statusCode).toBe(400);

    const huge = await app.inject({
      method: 'GET',
      url: '/api/pos/analytics/flowers?from=2020-01-01&to=2026-09-01',
      headers: auth(store.ownerToken),
    });
    expect(huge.statusCode).toBe(400);
  });
});
