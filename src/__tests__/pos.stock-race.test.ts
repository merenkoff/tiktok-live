import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { completeSale } from '../pos/sales.service.js';
import { hashPassword, hashPin } from '../pos/core/crypto.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS stock race', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;

  beforeAll(async () => {
    // Ensure schema exists
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const sql = fs.readFileSync(path.join(dir, '../../migrations/002_pos_schema.sql'), 'utf-8');
    await pool.query(sql);

    const slug = `race_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('Race Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);

    const ownerHash = await hashPassword('x');
    const pinHash = await hashPin('9999');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash, pin_hash)
       VALUES ($1, 'owner', 'Race Owner', $2, $3, $4) RETURNING id`,
      [storeId, `${slug}@test.local`, ownerHash, pinHash]
    );
    staffId = Number(staff.rows[0].id);

    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'Race Tee') RETURNING id`,
      [storeId]
    );
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, sku, barcode, price_cents)
       VALUES ($1, $2, 'M', 'Black', $3, $4, 1000) RETURNING id`,
      [storeId, product.rows[0].id, `SKU-${slug}`, `BC-${slug}`]
    );
    variantId = Number(variant.rows[0].id);
    await pool.query(
      `INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 1)`,
      [variantId, storeId]
    );
  }, 60000);

  afterAll(async () => {
    if (storeId) {
      await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    }
    await pool.end();
  });

  it('allows only one of two concurrent sales for last unit', async () => {
    const payload = {
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'cash' as const, amount_cents: 1000 }],
    };

    const results = await Promise.allSettled([completeSale(payload), completeSale(payload)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const stock = await pool.query(`SELECT quantity FROM pos_stock WHERE variant_id = $1`, [
      variantId,
    ]);
    expect(Number(stock.rows[0].quantity)).toBe(0);
  });
});
