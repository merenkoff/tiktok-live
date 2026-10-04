// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.sales.exchange.test.ts — the service half of an exchange
// (TechDocs/POS_CLOTHING.md R1/R2).
//
// An exchange is a refund and a sale in ONE transaction, linked by
// `pos_sales.exchange_refund_id`. What is pinned here is the part the fiscal
// tests cannot see: that the two halves commit together or not at all, that a
// «Брак» return takes the goods off the shelf again through a posted write-off
// the owner can reverse, and that the receipt card and the list can tell an
// exchange from a plain refund.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import {
  completeSale,
  exchangeSale,
  getSale,
  listSales,
  refundSale,
} from '../pos/sales.service.js';
import { reverseDocument } from '../pos/stock-documents.service.js';
import {
  applyPosMigrations,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

describe.skipIf(!hasDb)('POS exchange — service', () => {
  let store: TestStore;
  let coat = 0;
  let tee = 0;
  let scarf = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('exch');
    coat = (await seedProduct(store.storeId, { name: 'Пальто', priceCents: 50000, quantity: 10 })).variantId;
    tee = (await seedProduct(store.storeId, { name: 'Футболка', priceCents: 30000, quantity: 10 })).variantId;
    scarf = (await seedProduct(store.storeId, { name: 'Шарф', priceCents: 20000, quantity: 10 })).variantId;
    await pool.query(`UPDATE pos_variants SET cost_cents = 20000 WHERE id = $1`, [coat]);
  }, 120000);

  afterAll(async () => {
    await dropTestStore(store?.storeId);
  });

  const stockOf = async (variantId: number) =>
    Number((await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  const sellCoat = async (method: 'cash' | 'card' = 'cash') =>
    (await completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [{ variant_id: coat, quantity: 1 }],
      payments: [{ method, amount_cents: 50000 }],
    }))!;

  const refundCounter = async () =>
    Number(
      (
        await pool.query(
          `SELECT next_value FROM pos_store_counters WHERE store_id = $1 AND counter_key = 'refund'`,
          [store.storeId]
        )
      ).rows[0]?.next_value ?? 1
    );

  it('writes the refund and the new sale together and links them both ways', async () => {
    const sale = await sellCoat();
    const coatBefore = await stockOf(coat);
    const teeBefore = await stockOf(tee);

    const ids = await exchangeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      saleId: sale.id,
      refund: {
        items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
        method: 'cash',
        reason_code: 'size',
        client_uuid: randomUUID(),
      },
      sale: {
        items: [{ variant_id: tee, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 30000 }],
        client_uuid: randomUUID(),
      },
    });

    const original = (await getSale(store.storeId, sale.id))!;
    const fresh = (await getSale(store.storeId, ids.newSaleId))!;

    expect(original.status).toBe('refunded');
    expect(original.refunds).toHaveLength(1);
    const refund = original.refunds[0];
    expect(refund.id).toBe(ids.refundId);
    expect(refund.reason_code).toBe('size');
    expect(refund.method).toBe('cash');
    expect(refund.exchange_sale).toEqual({
      id: ids.newSaleId,
      receipt_number: fresh.receipt_number,
      status: 'completed',
    });
    expect(refund.items).toEqual([
      expect.objectContaining({ sale_item_id: sale.items[0].id, quantity: 1, line_total_cents: 50000 }),
    ]);

    expect(fresh.exchange_of).toEqual({
      refund_id: ids.refundId,
      refund_number: refund.refund_number,
      refund_total_cents: 50000,
      sale_id: sale.id,
      receipt_number: sale.receipt_number,
    });
    expect(fresh.total_cents).toBe(30000);
    // Two full documents: the shelf sees the coat back and the tee gone.
    expect(await stockOf(coat)).toBe(coatBefore + 1);
    expect(await stockOf(tee)).toBe(teeBefore - 1);

    // The lists carry the badges without a second read.
    const rows = await listSales(store.storeId, { limit: 10 });
    const originalRow = rows.find((r) => r.id === sale.id)!;
    const freshRow = rows.find((r) => r.id === ids.newSaleId)!;
    expect(originalRow.exchange_sale_number).toBe(fresh.receipt_number);
    expect(originalRow.exchange_of_receipt_number).toBeNull();
    expect(freshRow.exchange_of_receipt_number).toBe(sale.receipt_number);
    expect(freshRow.exchange_sale_number).toBeNull();
  });

  it('leaves nothing behind when the sale half is refused — no refund, no number, no stock move', async () => {
    const sale = await sellCoat();
    const coatBefore = await stockOf(coat);
    const counterBefore = await refundCounter();
    await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [scarf]);
    try {
      await expect(
        exchangeSale({
          storeId: store.storeId,
          staffId: store.sellerId,
          saleId: sale.id,
          refund: {
            items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
            method: 'cash',
            client_uuid: randomUUID(),
          },
          sale: {
            items: [{ variant_id: scarf, quantity: 1 }],
            payments: [{ method: 'cash', amount_cents: 20000 }],
            client_uuid: randomUUID(),
          },
        })
      ).rejects.toThrow('Some variants not found or inactive');
    } finally {
      await pool.query(`UPDATE pos_variants SET is_active = TRUE WHERE id = $1`, [scarf]);
    }
    const after = (await getSale(store.storeId, sale.id))!;
    expect(after.status).toBe('completed');
    expect(after.refunds).toHaveLength(0);
    expect(await stockOf(coat)).toBe(coatBefore);
    expect(await refundCounter()).toBe(counterBefore);
  });

  it('refuses the halves the law would refuse: a cash return of a card receipt, no new goods, one uuid for both', async () => {
    const sale = await sellCoat('card');
    const base = {
      storeId: store.storeId,
      staffId: store.sellerId,
      saleId: sale.id,
    };
    const refund = (method: 'cash' | 'card') => ({
      items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
      method,
      client_uuid: randomUUID(),
    });
    const newSale = () => ({
      items: [{ variant_id: tee, quantity: 1 }],
      payments: [{ method: 'card' as const, amount_cents: 30000 }],
      client_uuid: randomUUID(),
    });

    await expect(
      exchangeSale({ ...base, refund: refund('cash'), sale: newSale() })
    ).rejects.toThrow('Чек оплачено карткою — повернення теж на картку');
    await expect(
      exchangeSale({ ...base, refund: refund('card'), sale: { ...newSale(), items: [] } })
    ).rejects.toThrow('Оберіть новий товар');
    const same = randomUUID();
    await expect(
      exchangeSale({
        ...base,
        refund: { ...refund('card'), client_uuid: same },
        sale: { ...newSale(), client_uuid: same },
      })
    ).rejects.toThrow('client_uuid повернення і продажу мають відрізнятися');
    await expect(
      exchangeSale({ ...base, refund: { ...refund('card'), client_uuid: 'nope' }, sale: newSale() })
    ).rejects.toThrow('client_uuid обовʼязковий для обміну');

    expect((await getSale(store.storeId, sale.id))!.refunds).toHaveLength(0);
  });

  it('keeps the original receipt\'s customer on the new one unless told otherwise', async () => {
    const customer = await pool.query(
      `INSERT INTO pos_customers (store_id, name, phone) VALUES ($1, 'Олена', '+380671112233') RETURNING id`,
      [store.storeId]
    );
    const customerId = Number(customer.rows[0].id);
    const sale = (await completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [{ variant_id: coat, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 50000 }],
      customer_id: customerId,
    }))!;
    const ids = await exchangeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      saleId: sale.id,
      refund: { items: [{ sale_item_id: sale.items[0].id, quantity: 1 }], method: 'cash', client_uuid: randomUUID() },
      sale: {
        items: [{ variant_id: tee, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 30000 }],
        client_uuid: randomUUID(),
      },
    });
    expect((await getSale(store.storeId, ids.newSaleId))!.customer_id).toBe(customerId);

    const second = (await completeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      items: [{ variant_id: coat, quantity: 1 }],
      payments: [{ method: 'cash', amount_cents: 50000 }],
      customer_id: customerId,
    }))!;
    const anonymous = await exchangeSale({
      storeId: store.storeId,
      staffId: store.sellerId,
      saleId: second.id,
      refund: { items: [{ sale_item_id: second.items[0].id, quantity: 1 }], method: 'cash', client_uuid: randomUUID() },
      sale: {
        items: [{ variant_id: tee, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 30000 }],
        customer_id: null,
        client_uuid: randomUUID(),
      },
    });
    expect((await getSale(store.storeId, anonymous.newSaleId))!.customer_id).toBeNull();
  });

  describe('«Брак» — the goods do not go back on the shelf', () => {
    it('posts a write-off in the refund\'s transaction, priced, reversible, and the shelf stays where the sale left it', async () => {
      const sale = await sellCoat();
      const afterSale = await stockOf(coat);
      const uuid = randomUUID();

      const done = (await refundSale({
        storeId: store.storeId,
        saleId: sale.id,
        staffId: store.sellerId,
        items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
        method: 'cash',
        reason_code: 'defect',
        reason: 'розійшовся шов',
        client_uuid: uuid,
      }))!;
      const refund = done.refunds[0];
      expect(refund.reason_code).toBe('defect');
      expect(refund.writeoff_doc_number).toMatch(/^СП-\d{4}-\d{5}$/);
      // Came back (+1) and was written off (−1): sellable stock is unchanged.
      expect(await stockOf(coat)).toBe(afterSale);

      const doc = await pool.query(
        `SELECT d.id, d.type, d.status, d.reason_code, d.note, d.client_uuid, l.quantity, l.unit_cost_cents
         FROM pos_stock_documents d
         JOIN pos_stock_document_lines l ON l.document_id = d.id
         WHERE d.doc_number = $1 AND d.store_id = $2`,
        [refund.writeoff_doc_number, store.storeId]
      );
      expect(doc.rows).toHaveLength(1);
      expect(doc.rows[0]).toMatchObject({
        type: 'writeoff',
        status: 'posted',
        reason_code: 'damaged',
        client_uuid: uuid,
      });
      expect(String(doc.rows[0].note)).toContain(sale.receipt_number);
      expect(String(doc.rows[0].note)).toContain(refund.refund_number);
      expect(Number(doc.rows[0].quantity)).toBe(1);
      expect(Number(doc.rows[0].unit_cost_cents)).toBe(20000);

      const movements = await pool.query(
        `SELECT reason, delta, reference_type FROM pos_stock_movements
         WHERE variant_id = $1 AND reference_id IN ($2, $3) ORDER BY id`,
        [coat, refund.id, Number(doc.rows[0].id)]
      );
      expect(movements.rows.map((m) => [m.reason, Number(m.delta), m.reference_type])).toEqual([
        ['refund', 1, 'refund'],
        ['writeoff', -1, 'stock_document'],
      ]);

      // The jacket turned out to be fine: the owner reverses the write-off
      // and it is back on the shelf — through the document, never by editing
      // the refund.
      await reverseDocument({
        storeId: store.storeId,
        documentId: Number(doc.rows[0].id),
        staffId: store.ownerId,
      });
      expect(await stockOf(coat)).toBe(afterSale + 1);
    });

    it('works through an exchange too, and a proper-quality return posts no document', async () => {
      const sale = await sellCoat();
      const afterSale = await stockOf(coat);
      const ids = await exchangeSale({
        storeId: store.storeId,
        staffId: store.sellerId,
        saleId: sale.id,
        refund: {
          items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
          method: 'cash',
          reason_code: 'defect',
          client_uuid: randomUUID(),
        },
        sale: {
          items: [{ variant_id: coat, quantity: 1 }],
          payments: [{ method: 'cash', amount_cents: 50000 }],
          client_uuid: randomUUID(),
        },
      });
      // Back (+1), written off (−1), a new one sold (−1).
      expect(await stockOf(coat)).toBe(afterSale - 1);
      const original = (await getSale(store.storeId, sale.id))!;
      expect(original.refunds[0].writeoff_doc_number).toMatch(/^СП-/);
      expect(original.refunds[0].exchange_sale?.id).toBe(ids.newSaleId);

      const plain = await sellCoat();
      const back = (await refundSale({
        storeId: store.storeId,
        saleId: plain.id,
        staffId: store.sellerId,
        items: [{ sale_item_id: plain.items[0].id, quantity: 1 }],
        method: 'cash',
        reason_code: 'color',
        client_uuid: randomUUID(),
      }))!;
      expect(back.refunds[0].writeoff_doc_number).toBeNull();
    });

    it('refuses a defect against a shelf that was already below zero, in words', async () => {
      const sale = await sellCoat();
      // −1: the return itself lands on zero (a return onto a shelf further
      // below is refused before the write-off is reached), and the write-off
      // would take it under again.
      await pool.query(`UPDATE pos_stock SET quantity = -1 WHERE variant_id = $1`, [coat]);
      try {
        await expect(
          refundSale({
            storeId: store.storeId,
            saleId: sale.id,
            staffId: store.sellerId,
            items: [{ sale_item_id: sale.items[0].id, quantity: 1 }],
            method: 'cash',
            reason_code: 'defect',
            client_uuid: randomUUID(),
          })
        ).rejects.toThrow('Залишок «Пальто» відʼємний — спершу виправте залишок, потім оформлюйте брак');
        // Nothing half-done: no refund row, the shelf as it was.
        expect((await getSale(store.storeId, sale.id))!.refunds).toHaveLength(0);
        expect(await stockOf(coat)).toBe(-1);
      } finally {
        await pool.query(`UPDATE pos_stock SET quantity = 10 WHERE variant_id = $1`, [coat]);
      }
    });
  });
});
