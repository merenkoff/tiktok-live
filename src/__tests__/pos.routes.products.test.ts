// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.products.test.ts
//
// products.routes + catalog.routes. The split in access is the interesting
// part: /catalog and /tags are open to any signed-in cashier (the till needs
// them), while every write and the whole /products surface is owner-only behind
// the `products` module. Also covers the multipart /uploads endpoint end to end.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rm } from 'fs/promises';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { POS_UPLOADS_DIR } from '../pos/uploads.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';

/** Build a multipart/form-data body with one file part. */
function multipart(opts: {
  field?: string;
  filename: string;
  contentType: string;
  body: Buffer;
  headers?: Record<string, string>;
}) {
  const boundary = '----posTestBoundary1234567890';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${opts.field ?? 'file'}"; filename="${opts.filename}"\r\n` +
      `Content-Type: ${opts.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, opts.body, tail]),
    headers: {
      ...(opts.headers ?? {}),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

describe.skipIf(!hasDb)('POS products & catalog routes', () => {
  let app: FastifyInstance;
  let store: TestStore;
  const uploaded: string[] = [];

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('rprod');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await Promise.all(uploaded.map((f) => rm(path.join(POS_UPLOADS_DIR, f), { force: true })));
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  describe('access control', () => {
    it.each([
      ['GET', '/api/pos/products'],
      ['POST', '/api/pos/products'],
      ['GET', '/api/pos/catalog'],
      ['GET', '/api/pos/tags'],
    ])('401s %s %s without a token', async (method, url) => {
      const res = await app.inject({ method: method as 'GET', url });
      expect(res.statusCode).toBe(401);
    });

    it.each([
      ['GET', '/api/pos/products'],
      ['POST', '/api/pos/tags'],
    ])('403s %s %s for a seller', async (method, url) => {
      const res = await app.inject({
        method: method as 'GET',
        url,
        headers: auth(store.sellerToken),
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('lets a seller read the catalog and the tag list', async () => {
      const catalog = await app.inject({
        method: 'GET',
        url: '/api/pos/catalog',
        headers: auth(store.sellerToken),
      });
      const tags = await app.inject({
        method: 'GET',
        url: '/api/pos/tags',
        headers: auth(store.sellerToken),
      });
      expect(catalog.statusCode).toBe(200);
      expect(tags.statusCode).toBe(200);
    });

    it('404s the products surface when the module is off, but keeps the catalog open', async () => {
      const temp = await createTestStore('rprodoff');
      try {
        await setEnabledModules(temp.storeId, ['stock']);
        const products = await app.inject({
          method: 'GET',
          url: '/api/pos/products',
          headers: auth(temp.ownerToken),
        });
        const catalog = await app.inject({
          method: 'GET',
          url: '/api/pos/catalog',
          headers: auth(temp.ownerToken),
        });
        expect(products.statusCode).toBe(404);
        expect(catalog.statusCode).toBe(200);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('POST /products', () => {
    it('creates with 201 and echoes the persisted product', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: {
          name: 'Route Jacket',
          variants: [{ size: 'L', color: 'green', price_cents: 30000, quantity: 2 }],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Route Jacket');
      expect(res.json().variants[0].quantity).toBe(2);
    });

    it('400s with the service message on invalid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: { name: 'No variants', variants: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('At least one variant is required');
    });

    it('409s when a barcode collides with an existing variant', async () => {
      const barcode = `482${Date.now()}`.slice(0, 13);
      const first = await app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: { name: 'Barcode owner', variants: [{ price_cents: 100, barcode }] },
      });
      expect(first.statusCode).toBe(201);

      const clash = await app.inject({
        method: 'POST',
        url: '/api/pos/products',
        headers: auth(store.ownerToken),
        payload: { name: 'Barcode thief', variants: [{ price_cents: 100, barcode }] },
      });
      expect(clash.statusCode).toBe(409);
    });
  });

  describe('GET /products/:id', () => {
    it('404s for an unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/products/999999999',
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Product not found');
    });

    it('404s for a product owned by another store', async () => {
      const temp = await createTestStore('rprodx');
      try {
        const foreign = await seedProduct(temp.storeId);
        const res = await app.inject({
          method: 'GET',
          url: `/api/pos/products/${foreign.productId}`,
          headers: auth(store.ownerToken),
        });
        expect(res.statusCode).toBe(404);
      } finally {
        await dropTestStore(temp.storeId);
      }
    });
  });

  describe('variants', () => {
    it('adds a variant with 201', async () => {
      const seeded = await seedProduct(store.storeId, { name: 'Variant host' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/products/${seeded.productId}/variants`,
        headers: auth(store.ownerToken),
        payload: { size: 'XL', price_cents: 15000, quantity: 1 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().variants).toHaveLength(2);
    });

    it('400s when adding to a product that does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/products/999999999/variants',
        headers: auth(store.ownerToken),
        payload: { price_cents: 100 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Product not found');
    });

    it('400s a PATCH on an unknown variant', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/variants/999999999',
        headers: auth(store.ownerToken),
        payload: { price_cents: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Variant not found');
    });

    it('archives a variant and drops it out of the catalog', async () => {
      const seeded = await seedProduct(store.storeId, { name: 'Archivable variant' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/variants/${seeded.variantId}/archive`,
        headers: auth(store.ownerToken),
      });
      expect(res.statusCode).toBe(200);

      const catalog = await app.inject({
        method: 'GET',
        url: '/api/pos/catalog',
        headers: auth(store.sellerToken),
      });
      expect(catalog.json().map((c: { variant_id: number }) => c.variant_id)).not.toContain(
        seeded.variantId
      );
    });
  });

  describe('GET /catalog', () => {
    it('finds a variant by exact barcode', async () => {
      const barcode = `483${Date.now()}`.slice(0, 13);
      await seedProduct(store.storeId, { name: 'Scannable', barcode });

      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/catalog?barcode=${barcode}`,
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].barcode).toBe(barcode);
    });

    it('passes a numeric tag_id through from the query string', async () => {
      const tag = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: { name: `route-tag-${Date.now()}` },
      });
      const tagId = tag.json().id;
      const seeded = await seedProduct(store.storeId, { name: 'Tagged for catalog' });
      await app.inject({
        method: 'PUT',
        url: `/api/pos/products/${seeded.productId}/tags`,
        headers: auth(store.ownerToken),
        payload: { tag_ids: [tagId] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/pos/catalog?tag_id=${tagId}`,
        headers: auth(store.sellerToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].product_name).toBe('Tagged for catalog');
    });

    it('treats all=1 and snapshot=1 as the same snapshot switch', async () => {
      const withAll = await app.inject({
        method: 'GET',
        url: '/api/pos/catalog?q=zzz-no-match&all=1',
        headers: auth(store.sellerToken),
      });
      const withSnapshot = await app.inject({
        method: 'GET',
        url: '/api/pos/catalog?q=zzz-no-match&snapshot=1',
        headers: auth(store.sellerToken),
      });
      expect(withAll.json().length).toBe(withSnapshot.json().length);
      expect(withAll.json().length).toBeGreaterThan(0);
    });
  });

  describe('POST /uploads', () => {
    it('stores an image and returns its public URL with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/uploads',
        ...multipart({
          headers: auth(store.ownerToken),
          filename: 'photo.png',
          contentType: 'image/png',
          body: Buffer.from('fake-png-bytes'),
        }),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().url).toBe(`/pos-uploads/${res.json().filename}`);
      uploaded.push(res.json().filename);
    });

    it('serves the stored file back over the static prefix', async () => {
      const body = Buffer.from('round-trip-bytes');
      const upload = await app.inject({
        method: 'POST',
        url: '/api/pos/uploads',
        ...multipart({
          headers: auth(store.ownerToken),
          filename: 'x.png',
          contentType: 'image/png',
          body,
        }),
      });
      uploaded.push(upload.json().filename);

      const fetched = await app.inject({ method: 'GET', url: upload.json().url });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.rawPayload.equals(body)).toBe(true);
    });

    it('400s a disallowed content type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/uploads',
        ...multipart({
          headers: auth(store.ownerToken),
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-'),
        }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Дозволені формати: JPEG, PNG, WebP, GIF');
    });

    it('403s a seller — uploads are part of the owner-only products module', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/uploads',
        ...multipart({
          headers: auth(store.sellerToken),
          filename: 'photo.png',
          contentType: 'image/png',
          body: Buffer.from('x'),
        }),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('tags', () => {
    it('400s creating a tag with no name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('name required');
    });

    it('creates, lists and deletes a tag', async () => {
      const name = `lifecycle-${Date.now()}`;
      const created = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: { name },
      });
      expect(created.statusCode).toBe(201);

      const listed = await app.inject({
        method: 'GET',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
      });
      expect(listed.json().map((t: { name: string }) => t.name)).toContain(name);

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/pos/tags/${created.json().id}`,
        headers: auth(store.ownerToken),
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toEqual({ ok: true });
    });

    it('replaces the whole tag set on PUT /products/:id/tags', async () => {
      const seeded = await seedProduct(store.storeId, { name: 'Retaggable' });
      const a = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: { name: `set-a-${Date.now()}` },
      });
      const b = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: { name: `set-b-${Date.now()}` },
      });

      await app.inject({
        method: 'PUT',
        url: `/api/pos/products/${seeded.productId}/tags`,
        headers: auth(store.ownerToken),
        payload: { tag_ids: [a.json().id] },
      });
      const replaced = await app.inject({
        method: 'PUT',
        url: `/api/pos/products/${seeded.productId}/tags`,
        headers: auth(store.ownerToken),
        payload: { tag_ids: [b.json().id] },
      });
      expect(replaced.json().tag_ids).toEqual([b.json().id]);
    });

    it('clears every tag when tag_ids is omitted', async () => {
      const seeded = await seedProduct(store.storeId, { name: 'Untaggable' });
      const tag = await app.inject({
        method: 'POST',
        url: '/api/pos/tags',
        headers: auth(store.ownerToken),
        payload: { name: `clear-${Date.now()}` },
      });
      await app.inject({
        method: 'PUT',
        url: `/api/pos/products/${seeded.productId}/tags`,
        headers: auth(store.ownerToken),
        payload: { tag_ids: [tag.json().id] },
      });

      const cleared = await app.inject({
        method: 'PUT',
        url: `/api/pos/products/${seeded.productId}/tags`,
        headers: auth(store.ownerToken),
        payload: {},
      });
      expect(cleared.json().tag_ids).toEqual([]);
    });
  });
});
