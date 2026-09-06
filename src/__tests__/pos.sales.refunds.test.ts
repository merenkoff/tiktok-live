// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { applyPosMigrations } from './helpers/pos-fixtures.js';
import { completeSale, voidSale, refundSale, getSale } from '../pos/sales.service.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

/**
 * Returning money is the primitive the till leans on, so these run against the
 * real schema: refunds must be idempotent under replay, must hand back exactly
 * what was charged on a discounted receipt, and must never credit stock twice.
 */
describe.skipIf(!hasDb)('POS refunds and voids', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;

  beforeAll(async () => {
    await applyPosMigrations();

    const slug = `void_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Void Store', $1) RETURNING id`, [slug]);
    storeId = Number(store.rows[0].id);
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
       VALUES ($1, 'owner', 'Void Owner', $2, $3, $4) RETURNING id`,
      [storeId, `${slug}@test.local`, await hashPassword('x'), await hashPin('9999')]);
    staffId = Number(staff.rows[0].id);
    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Void Tee') RETURNING id`, [storeId]);
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents)
       VALUES ($1, $2, 'M', 'Black', $3, $4, 1000) RETURNING id`,
      [storeId, product.rows[0].id, `SKU-${slug}`, `BC-${slug}`]);
    variantId = Number(variant.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 10)`,
      [variantId, storeId]);
  }, 60000);

  afterAll(async () => {
    if (storeId) {
      await pool.query(`DELETE FROM pos_refund_items WHERE refund_id IN (SELECT id FROM pos_refunds WHERE store_id = $1)`, [storeId]);
      await pool.query(`DELETE FROM pos_refunds WHERE store_id = $1`, [storeId]);
      await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    }
    await pool.end();
  });

  const sell = (uuid?: string) => completeSale({
    storeId, staffId,
    items: [{ variant_id: variantId, quantity: 2 }],
    payments: [{ method: 'cash' as const, amount_cents: 2000 }],
    ...(uuid ? { client_uuid: uuid } : {}),
  });

  const stock = async () => Number((await pool.query(
    `SELECT quantity FROM pos_stock WHERE variant_id = $1`, [variantId])).rows[0].quantity);

  it('returns stock exactly once across a replayed void', async () => {
    const sale = await sell();
    expect(await stock()).toBe(8);

    const first = await voidSale({ storeId, saleId: sale!.id, staffId });
    expect(first!.status).toBe('voided');
    expect(await stock()).toBe(10);

    // Replay — must be a no-op, not an error, and must not double-credit stock.
    const second = await voidSale({ storeId, saleId: sale!.id, staffId });
    expect(second!.status).toBe('voided');
    expect(await stock()).toBe(10);
  });

  it('exposes client_uuid on getSale', async () => {
    const uuid = crypto.randomUUID();
    const sale = await completeSale({
      storeId, staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'cash' as const, amount_cents: 1000 }],
      client_uuid: uuid,
    });
    const fetched = await getSale(storeId, sale!.id);
    expect(fetched!.client_uuid).toBe(uuid);
  });

  it('still refuses to void a sale that has refunds', async () => {
    const sale = await sell();
    await refundSale({ storeId, saleId: sale!.id, staffId,
      items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }] });
    await expect(voidSale({ storeId, saleId: sale!.id, staffId }))
      .rejects.toThrow(/refunds|completed/);
  });

  it('refunds a discounted receipt for what was charged, not the subtotal', async () => {
    // 3 x 1000 with 10% off the cart: subtotal 3000, total 2700.
    const sale = await completeSale({
      storeId, staffId,
      items: [{ variant_id: variantId, quantity: 3 }],
      payments: [{ method: 'cash' as const, amount_cents: 2700 }],
      cart_discount: { type: 'percent', value: 10 },
    });
    expect(sale!.subtotal_cents).toBe(3000);
    expect(sale!.total_cents).toBe(2700);

    const itemId = sale!.items[0].id;
    const partial = await refundSale({ storeId, saleId: sale!.id, staffId,
      items: [{ sale_item_id: itemId, quantity: 1 }], method: 'cash' });
    expect(partial!.status).toBe('partially_refunded');
    expect(partial!.refunded_cents).toBe(900);

    const rest = await refundSale({ storeId, saleId: sale!.id, staffId,
      items: [{ sale_item_id: itemId, quantity: 2 }], method: 'cash' });
    // The whole receipt back means exactly total_cents — never the subtotal.
    expect(rest!.refunded_cents).toBe(2700);
    expect(rest!.status).toBe('refunded');
  });

  it('returns only the refunded units to stock and records the reason', async () => {
    const before = await stock();
    const sale = await sell();
    const after = await refundSale({
      storeId, saleId: sale!.id, staffId, method: 'cash',
      items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
      reason: 'не підійшов розмір', client_uuid: crypto.randomUUID(),
    });

    // sell() moves 2 units out; only 1 comes back.
    expect(await stock()).toBe(before - 1);
    expect(after!.status).toBe('partially_refunded');
    expect(after!.items[0].refunded_quantity).toBe(1);
    expect(after!.refunds[0].reason).toBe('не підійшов розмір');
  });

  it('numbers refund documents sequentially within the store', async () => {
    const once = async () => {
      const sale = await sell();
      const done = await refundSale({
        storeId, saleId: sale!.id, staffId, method: 'cash',
        items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }],
        client_uuid: crypto.randomUUID(),
      });
      return done!.refunds[0].refund_number!;
    };
    const first = await once();
    const second = await once();
    expect(Number(second.slice(3))).toBe(Number(first.slice(3)) + 1);
  });

  it('is idempotent per client_uuid and numbers each refund document', async () => {
    const sale = await sell();
    const uuid = crypto.randomUUID();
    const args = { storeId, saleId: sale!.id, staffId, method: 'card' as const,
      items: [{ sale_item_id: sale!.items[0].id, quantity: 1 }], client_uuid: uuid };

    const first = await refundSale(args);
    const replay = await refundSale(args);

    expect(replay!.refunded_cents).toBe(first!.refunded_cents);
    expect(replay!.refunds.length).toBe(first!.refunds.length);

    const doc = replay!.refunds[replay!.refunds.length - 1];
    expect(doc.refund_number).toMatch(/^RF-\d{5}$/);
    expect(doc.method).toBe('card');
    expect(doc.client_uuid).toBe(uuid);
  });
});
