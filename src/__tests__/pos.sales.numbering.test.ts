// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.sales.numbering.test.ts
//
// Receipt and refund numbering. Previously `COUNT(*) + 1`, which two tills in
// one store resolved to the same number — the second checkout then died on the
// `(store_id, receipt_number)` unique index and the sale was lost. Numbers now
// come from `pos_store_counters`, so these tests hold the line on: uniqueness
// under concurrency, monotonicity, per-store scoping, and continuity with
// numbers issued before the change.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { completeSale, refundSale } from '../pos/sales.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS document numbering', () => {
  let store: TestStore;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('num');
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  async function sell(storeId: number, staffId: number, variantId: number) {
    return completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 1000 }],
    });
  }

  it('numbers receipts sequentially from R-00001', async () => {
    const temp = await createTestStore('numseq');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 10 });
      const numbers = [];
      for (let i = 0; i < 3; i++) {
        numbers.push((await sell(temp.storeId, temp.sellerId, item.variantId)).receipt_number);
      }
      expect(numbers).toEqual(['R-00001', 'R-00002', 'R-00003']);
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  it('gives concurrent checkouts distinct receipt numbers', async () => {
    const temp = await createTestStore('numrace');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 100 });
      const results = await Promise.all(
        Array.from({ length: 8 }, () => sell(temp.storeId, temp.sellerId, item.variantId))
      );
      const numbers = results.map((r) => r.receipt_number);
      expect(new Set(numbers).size).toBe(8);
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  it('never rejects a concurrent sale of the last unit', async () => {
    const temp = await createTestStore('numlast');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 1 });
      const settled = await Promise.allSettled([
        sell(temp.storeId, temp.sellerId, item.variantId),
        sell(temp.storeId, temp.sellerId, item.variantId),
      ]);
      expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(0);

      const stock = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
        item.variantId,
      ]);
      expect(Number(stock.rows[0].quantity)).toBe(-1);
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  it('numbers each store independently', async () => {
    const a = await createTestStore('numa');
    const b = await createTestStore('numb');
    try {
      const itemA = await seedProduct(a.storeId, { priceCents: 1000, quantity: 5 });
      const itemB = await seedProduct(b.storeId, { priceCents: 1000, quantity: 5 });
      await sell(a.storeId, a.sellerId, itemA.variantId);
      const secondA = await sell(a.storeId, a.sellerId, itemA.variantId);
      const firstB = await sell(b.storeId, b.sellerId, itemB.variantId);

      expect(secondA.receipt_number).toBe('R-00002');
      expect(firstB.receipt_number).toBe('R-00001');
    } finally {
      await dropTestStore(a.storeId);
      await dropTestStore(b.storeId);
    }
  });

  it('continues from the highest number a store already issued', async () => {
    // Simulates a store that was trading before the counter existed: its rows
    // carry receipt numbers but there is no counter row yet.
    const temp = await createTestStore('numlegacy');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 5 });
      await pool.query(
        `INSERT INTO pos_sales (store_id, staff_id, receipt_number, total_cents)
         VALUES ($1, $2, 'R-00041', 1000)`,
        [temp.storeId, temp.sellerId]
      );
      const next = await sell(temp.storeId, temp.sellerId, item.variantId);
      expect(next.receipt_number).toBe('R-00042');
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  it('ignores receipt numbers that are not in our format when seeding', async () => {
    // A store migrated from another till system can carry numbers we did not
    // issue. Parsing their digits blindly used to overflow the int4 counter.
    const temp = await createTestStore('numforeign');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 5 });
      for (const foreign of ['CHK/2024/000917', 'R-1788654513853', 'legacy-42']) {
        await pool.query(
          `INSERT INTO pos_sales (store_id, staff_id, receipt_number, total_cents)
           VALUES ($1, $2, $3, 1000)`,
          [temp.storeId, temp.sellerId, foreign]
        );
      }
      const next = await sell(temp.storeId, temp.sellerId, item.variantId);
      expect(next.receipt_number).toBe('R-00001');
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  it('does not reuse a number after a sale row disappears', async () => {
    // The old COUNT(*) scheme would hand out a number that already existed.
    const temp = await createTestStore('numgap');
    try {
      const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 5 });
      const first = await sell(temp.storeId, temp.sellerId, item.variantId);
      const second = await sell(temp.storeId, temp.sellerId, item.variantId);
      await pool.query(`DELETE FROM pos_sale_items WHERE sale_id = $1`, [first.id]);
      await pool.query(`DELETE FROM pos_sales WHERE id = $1`, [first.id]);

      const third = await sell(temp.storeId, temp.sellerId, item.variantId);
      expect(third.receipt_number).not.toBe(first.receipt_number);
      expect(third.receipt_number).not.toBe(second.receipt_number);
      expect(third.receipt_number).toBe('R-00003');
    } finally {
      await dropTestStore(temp.storeId);
    }
  });

  describe('refunds', () => {
    it('numbers refunds on their own RF- sequence', async () => {
      const temp = await createTestStore('numref');
      try {
        const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 10 });
        const numbers: string[] = [];
        for (let i = 0; i < 2; i++) {
          const sale = await sell(temp.storeId, temp.sellerId, item.variantId);
          // refundSale answers with the *sale*; the refund document it just
          // issued is the last entry in its refunds array.
          const after = await refundSale({
            storeId: temp.storeId,
            saleId: sale.id,
            staffId: temp.sellerId,
            items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
          });
          numbers.push(after!.refunds[after!.refunds.length - 1].refund_number!);
        }
        expect(numbers).toEqual(['RF-00001', 'RF-00002']);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });

    it('gives concurrent refunds of different sales distinct numbers', async () => {
      const temp = await createTestStore('numrefrace');
      try {
        const item = await seedProduct(temp.storeId, { priceCents: 1000, quantity: 20 });
        const sales = [];
        for (let i = 0; i < 5; i++) {
          sales.push(await sell(temp.storeId, temp.sellerId, item.variantId));
        }
        await Promise.all(
          sales.map((sale) =>
            refundSale({
              storeId: temp.storeId,
              saleId: sale.id,
              staffId: temp.sellerId,
              items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
            })
          )
        );
        const issued = await pool.query(
          `SELECT refund_number FROM pos_refunds WHERE store_id = $1`,
          [temp.storeId]
        );
        const numbers = issued.rows.map((r) => r.refund_number);
        expect(numbers).toHaveLength(5);
        expect(new Set(numbers).size).toBe(5);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });
});
