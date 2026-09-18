// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.sales.order-no.test.ts — the daily order number
// (migration 047): «сорок два!», restarting every store-local day, no gaps,
// the same number on a replay. See TechDocs/POS_VERTICALS.md §7l.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { completeSale, listSales } from '../pos/sales.service.js';
import { createProduct } from '../pos/products.service.js';
import { localDateString } from '../pos/core/localDate.js';

describe.skipIf(!hasDb)('POS order numbers', () => {
  let store: TestStore;
  let variantId = 0;

  async function sell(clientUuid?: string) {
    return completeSale({
      storeId: store.storeId,
      staffId: store.ownerId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 10000 }],
      client_uuid: clientUuid,
    });
  }

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('ordno');
    variantId = (await seedProduct(store.storeId, { name: 'Кава', quantity: 100 })).variantId;
  }, 60000);

  afterAll(async () => {
    if (store) await dropTestStore(store.storeId);
  });

  it('counts 1, 2, 3 per store and per day, next to the receipt number', async () => {
    const first = await sell();
    const second = await sell();
    expect(first!.order_no).toBe(1);
    expect(second!.order_no).toBe(2);
    // The receipt number is a different thing and keeps its own shape.
    expect(first!.receipt_number).toMatch(/^R-\d{5}$/);
    expect(await listSales(store.storeId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: second!.id, order_no: 2 })])
    );

    // The counter is keyed on the store's own day, not UTC's.
    const key = await pool.query(
      `SELECT counter_key FROM pos_store_counters WHERE store_id = $1 AND counter_key LIKE 'order_%'`,
      [store.storeId]
    );
    const timezone = (await pool.query(`SELECT timezone FROM pos_stores WHERE id = $1`, [store.storeId]))
      .rows[0].timezone as string;
    expect(key.rows.map((r) => r.counter_key)).toEqual([`order_${localDateString(timezone)}`]);

    // Another store starts at 1 today, whatever this one is at.
    const other = await createTestStore('ordno2');
    try {
      const theirs = (await seedProduct(other.storeId, { name: 'Чай', quantity: 10 })).variantId;
      const sale = await completeSale({
        storeId: other.storeId,
        staffId: other.ownerId,
        items: [{ variant_id: theirs, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      });
      expect(sale!.order_no).toBe(1);
    } finally {
      await dropTestStore(other.storeId);
    }
  });

  it('gives the same number back on a client_uuid replay, and does not spend one', async () => {
    const uuid = randomUUID();
    const once = await sell(uuid);
    const again = await sell(uuid);
    expect(again!.id).toBe(once!.id);
    expect(again!.order_no).toBe(once!.order_no);
    const next = await sell();
    expect(next!.order_no).toBe(once!.order_no! + 1);
  });

  it('leaves no gap behind a sale that failed after being numbered', async () => {
    // A derived composite whose recipe is emptied by raw SQL: the sale is
    // numbered, then the write-off refuses — and the number must come back.
    const hollow = await createProduct(store.storeId, {
      name: 'Порожній',
      kind: 'composite',
      stock_mode: 'derived',
      variants: [
        {
          attributes: {},
          price_cents: 10000,
          quantity: 0,
          components: [{ component_variant_id: variantId, quantity: 1 }],
        },
      ],
    });
    const hollowId = (hollow!.variants[0] as { id: number }).id;
    await pool.query(`DELETE FROM pos_product_components WHERE variant_id = $1`, [hollowId]);
    await pool.query(`DELETE FROM pos_product_components_flat WHERE variant_id = $1`, [hollowId]);

    const before = await sell();
    await expect(
      completeSale({
        storeId: store.storeId,
        staffId: store.ownerId,
        items: [{ variant_id: hollowId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
      })
    ).rejects.toThrow(/no composition/i);
    const after = await sell();
    expect(after!.order_no).toBe(before!.order_no! + 1);
  });

  it('is what the store-local day says, not what UTC says', () => {
    // 23:30 UTC on the 18th is already the 19th in Kyiv (UTC+3 in September).
    const at = new Date('2026-09-18T23:30:00Z');
    expect(localDateString('Europe/Kyiv', at)).toBe('2026-09-19');
    expect(localDateString('UTC', at)).toBe('2026-09-18');
  });
});
