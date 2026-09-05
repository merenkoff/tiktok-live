// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import { pool } from '../db.js';
import { hashPassword } from '../pos/core/crypto.js';
import { completeSale, getSale, listSales } from '../pos/sales.service.js';
import { getStore, updateStore, getSalesSummary } from '../pos/analytics.service.js';
import { getAuthByToken } from '../pos/core/auth.js';
import {
  applyPurposeTemplate,
  confirmQrPayment,
  createInvoice,
  QrProviderError,
  verifyWebhookSignature,
} from '../pos/qr.service.js';
import crypto from 'crypto';

const hasDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe('QR purpose template', () => {
  it('substitutes {ref} and {store} and collapses whitespace', () => {
    expect(applyPurposeTemplate('Оплата, {store}, чек {ref}', { ref: 'A1', store: 'My Shop' })).toBe(
      'Оплата, My Shop, чек A1'
    );
  });

  it('falls back to a default template when none is set', () => {
    expect(applyPurposeTemplate(null, { ref: 'X', store: 'S' })).toBe('Оплата, S, X');
  });

  it('truncates to 140 characters', () => {
    const out = applyPurposeTemplate('{store}', { ref: '', store: 'x'.repeat(300) });
    expect(out.length).toBe(140);
  });
});

describe('QR webhook signature', () => {
  const OLD = process.env.OPENDATABOT_QR_KEY;
  afterAll(() => {
    process.env.OPENDATABOT_QR_KEY = OLD;
  });

  it('accepts a valid HMAC-SHA256 hex signature and rejects a bad one', () => {
    process.env.OPENDATABOT_QR_KEY = 'secret';
    const body = Buffer.from('{"a":1}');
    const sig = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
    expect(verifyWebhookSignature(body, sig.replace(/.$/, '0'))).toBe(false);
    expect(verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('rejects everything when no key is configured', () => {
    delete process.env.OPENDATABOT_QR_KEY;
    const body = Buffer.from('{}');
    expect(verifyWebhookSignature(body, 'anything')).toBe(false);
  });
});

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
      '012_pos_qr_confirmations.sql',
      '015_pos_store_modules.sql',
      '016_pos_store_module_remotes.sql',
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

  describe('createInvoice (Opendatabot proxy)', () => {
    const OLD_ENV = { key: process.env.OPENDATABOT_QR_KEY, name: process.env.OPENDATABOT_QR_NAME };

    beforeAll(async () => {
      process.env.OPENDATABOT_QR_KEY = 'test-key';
      process.env.OPENDATABOT_QR_NAME = 'test-name';
      await updateStore(storeId, {
        qr_iban: 'UA093052990000026007233566001',
        qr_edrpou: '12345678',
        qr_purpose_template: 'Оплата, {store}, {ref}',
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    afterAll(() => {
      process.env.OPENDATABOT_QR_KEY = OLD_ENV.key;
      process.env.OPENDATABOT_QR_NAME = OLD_ENV.name;
    });

    it('POSTs the invoice request and maps the response', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'inv_abc',
          url: 'https://bank.gov.ua/qr/xyz',
          qrcode: 'data:image/png;base64,AAAA',
        }),
      })) as unknown as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);

      const inv = await createInvoice({ storeId, amountCents: 12345, saleRef: 'REF1' });
      expect(inv).toEqual({
        invoiceId: 'inv_abc',
        url: 'https://bank.gov.ua/qr/xyz',
        qrcode: 'data:image/png;base64,AAAA',
      });

      const [url, opts] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://iban.opendatabot.ua/api/invoice');
      expect(opts.headers['x-client-key']).toBe('test-key');
      expect(opts.headers['x-client-name']).toBe('test-name');
      const sent = JSON.parse(opts.body);
      expect(sent).toMatchObject({
        code: '12345678',
        iban: 'UA093052990000026007233566001',
        amount: '123.45',
        purpose: 'Оплата, QR Store, REF1',
        responseMode: 'json',
      });
    });

    it('throws qr_provider_unavailable on a non-2xx response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
      );
      await expect(createInvoice({ storeId, amountCents: 100, saleRef: '' })).rejects.toMatchObject({
        code: 'qr_provider_unavailable',
      });
    });

    it('throws qr_provider_unavailable when the request aborts', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new DOMException('timeout', 'TimeoutError');
        }) as unknown as typeof fetch
      );
      await expect(createInvoice({ storeId, amountCents: 100, saleRef: '' })).rejects.toBeInstanceOf(
        QrProviderError
      );
    });

    it('throws qr_no_credentials when env keys are missing', async () => {
      delete process.env.OPENDATABOT_QR_KEY;
      await expect(createInvoice({ storeId, amountCents: 100, saleRef: '' })).rejects.toMatchObject({
        code: 'qr_no_credentials',
      });
      process.env.OPENDATABOT_QR_KEY = 'test-key';
    });

    it('throws qr_not_configured when IBAN/EDRPOU are missing', async () => {
      await updateStore(storeId, { qr_iban: null, qr_edrpou: null });
      await expect(createInvoice({ storeId, amountCents: 100, saleRef: '' })).rejects.toMatchObject({
        code: 'qr_not_configured',
      });
    });
  });

  describe('confirmQrPayment', () => {
    let saleId = 0;
    let paymentId = 0;

    beforeAll(async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'qr', amount_cents: 1500, provider_ref: 'inv_confirm_1' }],
      });
      saleId = sale.id;
      paymentId = sale.payments[0].id;
    });

    it('starts unconfirmed and shows on the sales list as pending', async () => {
      const detail = await getSale(storeId, saleId);
      expect(detail?.payments[0].confirmed_at).toBeNull();
      const list = await listSales(storeId, { limit: 50 });
      expect(list.find((s) => s.id === saleId)?.qr_pending).toBe(true);
    });

    it('confirms by provider_ref and is idempotent', async () => {
      const first = await confirmQrPayment({ invoice: { id: 'inv_confirm_1' } });
      expect(first).toMatchObject({ matched: true, by: 'provider_ref', paymentId });

      const detail = await getSale(storeId, saleId);
      expect(detail?.payments[0].confirmed_at).not.toBeNull();

      const second = await confirmQrPayment({ invoice: { id: 'inv_confirm_1' } });
      expect(second.matched).toBe(false);
    });

    it('does not touch unrelated payments on a miss', async () => {
      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pos_payments WHERE method = 'qr' AND confirmed_at IS NULL`
      );
      const res = await confirmQrPayment({ invoice: { id: 'inv_does_not_exist' } });
      expect(res.matched).toBe(false);
      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pos_payments WHERE method = 'qr' AND confirmed_at IS NULL`
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('falls back to an amount match only when the provider reports matches.amount', async () => {
      const sale = await completeSale({
        storeId,
        staffId,
        items: [{ variant_id: variantId, quantity: 1 }],
        payments: [{ method: 'qr', amount_cents: 4242 }],
      });
      // amount present but matches.amount not set → no confirmation
      const skipped = await confirmQrPayment({ transaction: { amount: 42.42 } });
      expect(skipped.matched).toBe(false);

      const hit = await confirmQrPayment({
        matches: { amount: true },
        transaction: { amount: 42.42 },
      });
      expect(hit).toMatchObject({ matched: true, by: 'amount', saleId: sale.id });
    });
  });
});
