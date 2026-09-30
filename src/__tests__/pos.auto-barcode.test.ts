// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.auto-barcode.test.ts
//
// A garment carries a printed tag and its owner forgets the «Згенерувати»
// button (TechDocs/POS_CLOTHING.md, phase C1) — so a variant that is created
// without a barcode gets one of the store's own. Only where the vertical says
// so, only at creation, and never over a barcode somebody typed.
//
// Also the batch that a size × colour matrix is saved with: one transaction,
// all of it or none, and a clash names the article or barcode that was taken.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import * as products from '../pos/products.service.js';
import { isInternalBarcode } from '../pos/gtin/internal-code.js';
import { verifyCheckDigit } from '../pos/gtin/normalize.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';

type Variant = { id: number; barcode: string | null; sku: string | null; label: string };
type Product = { id: number; variants: Variant[] };

describe.skipIf(!hasDb)('automatic barcodes and the variant batch', () => {
  let app: FastifyInstance;
  let shop: TestStore;
  let florist: TestStore;
  let cafe: TestStore;
  let skuSeq = 0;
  const sku = (prefix = 'AB') => `${prefix}-${Date.now()}-${skuSeq++}`;

  beforeAll(async () => {
    await applyPosMigrations();
    shop = await createTestStore('abshop');
    florist = await createTestStore('abflor');
    cafe = await createTestStore('abcafe');
    await pool.query(`UPDATE pos_stores SET vertical = 'flowers' WHERE id = $1`, [florist.storeId]);
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    for (const s of [shop, florist, cafe]) await dropTestStore(s?.storeId);
    await pool.end();
  });

  const v = (attributes: Record<string, string>, extra: Record<string, unknown> = {}) => ({
    attributes,
    price_cents: 45000,
    ...extra,
  });

  describe('when a product is created', () => {
    it('gives every variant without a barcode one of the store\'s own: a valid, distinct EAN-13', async () => {
      const p = (await products.createProduct(shop.storeId, {
        name: 'Костюмчик',
        variants: [v({ color: 'блакитний', size: '86' }), v({ color: 'блакитний', size: '92' }), v({ color: 'рожевий', size: '86' })],
      })) as Product;

      const codes = p.variants.map((x) => x.barcode);
      expect(codes).toHaveLength(3);
      for (const code of codes) {
        expect(code).toMatch(/^29\d{11}$/);
        expect(isInternalBarcode(code)).toBe(true);
        expect(verifyCheckDigit(code!)).toBe(true);
      }
      expect(new Set(codes).size).toBe(3);
    });

    it('never replaces a barcode that was typed — and mints only for the variant that has none', async () => {
      const p = (await products.createProduct(shop.storeId, {
        name: 'Сукня',
        variants: [
          v({ color: 'біла', size: '92' }, { barcode: '4820024700016' }),
          v({ color: 'біла', size: '98' }),
        ],
      })) as Product;

      expect(p.variants.find((x) => x.label === 'біла / 92')!.barcode).toBe('4820024700016');
      expect(p.variants.find((x) => x.label === 'біла / 98')!.barcode).toMatch(/^29\d{11}$/);
    });

    it.each([['an empty string', ''], ['only spaces', '   '], ['null', null]])(
      'treats %s as no barcode',
      async (_name, barcode) => {
        const p = (await products.createProduct(shop.storeId, {
          name: `Реглан ${String(barcode)}`,
          variants: [v({ color: 'сірий', size: '98' }, { barcode })],
        })) as Product;
        expect(p.variants[0]!.barcode).toMatch(/^29\d{11}$/);
      }
    );

    it('does not touch a florist\'s or a café\'s variants', async () => {
      const rose = (await products.createProduct(florist.storeId, {
        name: 'Троянда',
        variants: [{ attributes: { color: 'червона', length_cm: 60 }, price_cents: 9000 }],
      })) as Product;
      const latte = (await products.createProduct(cafe.storeId, {
        name: 'Лате',
        variants: [{ attributes: { size: 'M' }, price_cents: 8000 }],
      })) as Product;

      expect(rose.variants[0]!.barcode).toBeNull();
      expect(latte.variants[0]!.barcode).toBeNull();
    });

    it('leaves the whole product unsaved when one barcode is taken: the mint is part of the transaction', async () => {
      const taken = sku('TAKEN');
      await products.createProduct(shop.storeId, {
        name: 'Перший',
        variants: [v({ color: 'а', size: '1' }, { sku: taken })],
      });
      const before = await pool.query(`SELECT count(*)::int AS n FROM pos_products WHERE store_id = $1`, [shop.storeId]);

      await expect(
        products.createProduct(shop.storeId, {
          name: 'Другий',
          variants: [v({ color: 'б', size: '2' }), v({ color: 'б', size: '3' }, { sku: taken })],
        })
      ).rejects.toMatchObject({ code: '23505' });

      const after = await pool.query(`SELECT count(*)::int AS n FROM pos_products WHERE store_id = $1`, [shop.storeId]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });
  });

  describe('when a variant is added to an existing product', () => {
    it('mints one, like a new product does', async () => {
      const p = (await products.createProduct(shop.storeId, {
        name: 'Боді',
        variants: [v({ color: 'білий', size: '62' })],
      })) as Product;
      const added = (await products.addVariant(shop.storeId, p.id, v({ color: 'білий', size: '68' }))) as Product;

      const fresh = added.variants.find((x) => x.label === 'білий / 68')!;
      expect(fresh.barcode).toMatch(/^29\d{11}$/);
    });
  });

  describe('when a variant is edited', () => {
    it('does not mint: clearing a barcode is something an owner may do', async () => {
      const p = (await products.createProduct(shop.storeId, {
        name: 'Шапка',
        variants: [v({ color: 'сіра', size: '48' })],
      })) as Product;
      const id = p.variants[0]!.id;
      expect(p.variants[0]!.barcode).toMatch(/^29/);

      const cleared = (await products.updateVariant(shop.storeId, id, { barcode: '' })) as Product;
      expect(cleared.variants.find((x) => x.id === id)!.barcode).toBeNull();
    });
  });

  describe('the batch (POST /products/:id/variants/batch)', () => {
    async function card(name: string): Promise<Product> {
      return (await products.createProduct(shop.storeId, {
        name,
        variants: [v({ color: 'перший', size: '1' })],
      })) as Product;
    }

    const post = (token: string, id: number, payload: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/pos/products/${id}/variants/batch`,
        headers: auth(token),
        payload: payload as object,
      });

    it('adds a whole matrix in one request, each with its own barcode and its quantity', async () => {
      const p = await card('Матриця');
      const rows = ['блакитний', 'рожевий'].flatMap((color) =>
        ['86-92', '92-98', '98-104'].map((size) => v({ color, size }, { quantity: 2, cost_cents: 20000 }))
      );

      const res = await post(shop.ownerToken, p.id, { variants: rows });

      expect(res.statusCode).toBe(201);
      const body = res.json() as Product;
      expect(body.variants).toHaveLength(1 + rows.length);
      const added = body.variants.filter((x) => x.label !== 'перший / 1');
      expect(new Set(added.map((x) => x.barcode)).size).toBe(6);
      const stock = await pool.query(
        `SELECT count(*)::int AS n, coalesce(sum(quantity), 0)::int AS qty
         FROM pos_stock WHERE variant_id = ANY($1::bigint[])`,
        [added.map((x) => x.id)]
      );
      expect(stock.rows[0]).toEqual({ n: 6, qty: 12 });
    });

    it('is all or nothing, and says WHICH article was taken (409)', async () => {
      const p = await card('Клаш');
      const clash = sku('CLASH');
      await products.addVariant(shop.storeId, p.id, v({ color: 'старий', size: '9' }, { sku: clash }));
      const before = await pool.query(`SELECT count(*)::int AS n FROM pos_variants WHERE product_id = $1`, [p.id]);

      const res = await post(shop.ownerToken, p.id, {
        variants: [v({ color: 'новий', size: '1' }), v({ color: 'новий', size: '2' }, { sku: clash })],
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain(clash);
      expect(res.json().error).toContain('Артикул');
      const after = await pool.query(`SELECT count(*)::int AS n FROM pos_variants WHERE product_id = $1`, [p.id]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('names a taken barcode the same way', async () => {
      const p = await card('КлашШтрих');
      const code = '4820024700023';
      await products.addVariant(shop.storeId, p.id, v({ color: 'старий', size: '9' }, { barcode: code }));

      const res = await post(shop.ownerToken, p.id, { variants: [v({ color: 'новий', size: '1' }, { barcode: code })] });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain(code);
      expect(res.json().error).toContain('Штрихкод');
    });

    it.each([
      ['an empty list', { variants: [] }],
      ['no list at all', {}],
      ['a negative price', { variants: [{ attributes: { color: 'а', size: '1' }, price_cents: -1 }] }],
      ['an attribute the vertical does not have', { variants: [v({ colour: 'а' })] }],
    ])('refuses %s with a 400 and adds nothing', async (_name, payload) => {
      const p = await card(`Відмова ${_name}`);
      const res = await post(shop.ownerToken, p.id, payload);

      expect(res.statusCode).toBe(400);
      const n = await pool.query(`SELECT count(*)::int AS n FROM pos_variants WHERE product_id = $1`, [p.id]);
      expect(n.rows[0].n).toBe(1);
    });

    it('caps one batch at 200', async () => {
      const p = await card('Ліміт');
      const rows = Array.from({ length: products.MAX_VARIANT_BATCH + 1 }, (_, i) => v({ color: 'к', size: String(i) }));

      const res = await post(shop.ownerToken, p.id, { variants: rows });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain(String(products.MAX_VARIANT_BATCH));
    });

    it('will not add to another store\'s product', async () => {
      const foreign = (await products.createProduct(florist.storeId, {
        name: 'Чужа',
        variants: [{ attributes: { color: 'х', length_cm: 40 }, price_cents: 100 }],
      })) as Product;

      const res = await post(shop.ownerToken, foreign.id, { variants: [v({ color: 'а', size: '1' })] });

      expect(res.statusCode).toBe(400);
      const n = await pool.query(`SELECT count(*)::int AS n FROM pos_variants WHERE product_id = $1`, [foreign.id]);
      expect(n.rows[0].n).toBe(1);
    });

    it('is the owner\'s: a seller gets 403 and an unauthenticated call 401', async () => {
      const p = await card('Права');
      const asSeller = await post(shop.sellerToken, p.id, { variants: [v({ color: 'а', size: '1' })] });
      const anonymous = await app.inject({
        method: 'POST',
        url: `/api/pos/products/${p.id}/variants/batch`,
        payload: { variants: [] },
      });

      expect(asSeller.statusCode).toBe(403);
      expect(anonymous.statusCode).toBe(401);
    });
  });
});
