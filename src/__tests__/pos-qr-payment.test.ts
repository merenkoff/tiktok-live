// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword } from '../pos/core/crypto.js';
import { completeSale } from '../pos/sales.service.js';
import { getStore, updateStore, getSalesSummary } from '../pos/analytics.service.js';
import { getAuthByToken } from '../pos/core/auth.js';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POS QR payment', () => {
  let storeId = 0;
  let staffId = 0;
  let variantId = 0;
  let token = '';

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of [
      '002_pos_schema.sql',
      '005_pos_discounts_customers.sql',
      '010_pos_offline_sync.sql',
      '011_pos_qr_payment.sql',
    ]) {
      const sql = fs.readFileSync(path.join(dir, '../../migrations', file), 'utf-8');
      await pool.query(sql);
    }

    const slug = `qr_${Date.now()}`;
    const store = await pool.query(
      `INSERT INTO pos_stores (name, slug) VALUES ('QR Store', $1) RETURNING id`,
      [slug]
    );
    storeId = Number(store.rows[0].id);

    const pw = await hashPassword('x');
    const staff = await pool.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
       VALUES ($1, 'owner', 'QR Owner', $2, $3) RETURNING id`,
      [storeId, `${slug}@t.local`, pw]
    );
    staffId = Number(staff.rows[0].id);

    token = `qr-token-${Date.now()}`;
    await pool.query(
      `INSERT INTO pos_sessions (store_id, staff_id, token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
      [storeId, staffId, token]
    );

    const product = await pool.query(
      `INSERT INTO pos_products (store_id, name) VALUES ($1, 'QR Tee') RETURNING id`,
      [storeId]
    );
    const variant = await pool.query(
      `INSERT INTO pos_variants (store_id, product_id, size, color, price_cents)
       VALUES ($1, $2, 'M', 'Blue', 1500) RETURNING id`,
      [storeId, product.rows[0].id]
    );
    variantId = Number(variant.rows[0].id);
    await pool.query(`INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES ($1, $2, 50)`, [
      variantId,
      storeId,
    ]);
  }, 60000);

  afterAll(async () => {
    if (storeId) await pool.query(`DELETE FROM pos_stores WHERE id = $1`, [storeId]);
    await pool.end();
  });

  it('migration widens the pos_payments method CHECK to include qr', async () => {
    const sale = await pool.query(
      `INSERT INTO pos_sales (store_id, staff_id, receipt_number, subtotal_cents, total_cents)
       VALUES ($1, $2, $3, 0, 0) RETURNING id`,
      [storeId, staffId, `RAW-${Date.now()}`]
    );
    const saleId = Number(sale.rows[0].id);

    await expect(
      pool.query(
        `INSERT INTO pos_payments (sale_id, store_id, method, amount_cents) VALUES ($1, $2, 'qr', 100)`,
        [saleId, storeId]
      )
    ).resolves.toBeTruthy();

    await expect(
      pool.query(
        `INSERT INTO pos_payments (sale_id, store_id, method, amount_cents) VALUES ($1, $2, 'bogus', 100)`,
        [saleId, storeId]
      )
    ).rejects.toThrow();
  });

  it('completes a sale paid by qr and stores provider_ref', async () => {
    const sale = await completeSale({
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 2 }],
      payments: [{ method: 'qr', amount_cents: 3000, provider_ref: 'inv_test_1' }],
    });
    expect(sale.status).toBe('completed');
    expect(sale.total_cents).toBe(3000);
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0].method).toBe('qr');

    const row = await pool.query(
      `SELECT method, provider_ref FROM pos_payments WHERE sale_id = $1`,
      [sale.id]
    );
    expect(row.rows[0].method).toBe('qr');
    expect(row.rows[0].provider_ref).toBe('inv_test_1');
  });

  it('is idempotent on client_uuid for a qr sale', async () => {
    const client_uuid = crypto.randomUUID();
    const payload = {
      storeId,
      staffId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'qr' as const, amount_cents: 1500 }],
      client_uuid,
    };
    const first = await completeSale(payload);
    const second = await completeSale(payload);
    expect(second.id).toBe(first.id);
    const payments = await pool.query(`SELECT COUNT(*)::int AS n FROM pos_payments WHERE sale_id = $1`, [
      first.id,
    ]);
    expect(payments.rows[0].n).toBe(1);
  });

  it('rejects an unknown payment method', async () => {
    await expect(
      completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments: [{ method: 'crypto' as any, amount_cents: 1500 }],
      })
    ).rejects.toThrow('Invalid payment method');
  });

  it('surfaces a qr bucket in the sales summary', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
    const summary = await getSalesSummary(storeId, { from: today, to: today });
    const qr = summary.payments.find((p) => p.method === 'qr');
    expect(qr).toBeDefined();
    expect(qr!.amount_cents).toBeGreaterThan(0);
  });

  it('exposes QR defaults from getStore and round-trips updateStore', async () => {
    const fresh = await getStore(storeId);
    expect(fresh?.qr_payment_enabled).toBe(false);
    expect(fresh?.qr_payment_mode).toBe('static');
    expect(fresh?.qr_static_image_url).toBeNull();
    expect(fresh?.qr_iban).toBeNull();

    const updated = await updateStore(storeId, {
      qr_payment_enabled: true,
      qr_payment_mode: 'dynamic',
      qr_iban: 'UA000000000000000000000000000',
      qr_edrpou: '12345678',
      qr_static_image_url: '/pos-uploads/qr.png',
    });
    expect(updated.qr_payment_enabled).toBe(true);
    expect(updated.qr_payment_mode).toBe('dynamic');

    const readBack = await getStore(storeId);
    expect(readBack?.qr_iban).toBe('UA000000000000000000000000000');
    expect(readBack?.qr_edrpou).toBe('12345678');
    expect(readBack?.qr_static_image_url).toBe('/pos-uploads/qr.png');
  });

  it('delivers store.qr_payment on the auth context', async () => {
    await updateStore(storeId, {
      qr_payment_enabled: true,
      qr_payment_mode: 'static',
      qr_static_image_url: '/pos-uploads/qr2.png',
    });
    const auth = await getAuthByToken(token);
    expect(auth?.qrPayment).toEqual({
      enabled: true,
      mode: 'static',
      static_image_url: '/pos-uploads/qr2.png',
    });
  });
});
