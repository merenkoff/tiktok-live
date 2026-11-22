// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.catalog-thumbs.test.ts — the till draws the small copy of
// a product photo (TechDocs/POS_CLOTHING.md «Головна каси й швидкість фото»).
//
// `GET /catalog` carries `thumb_url` beside `image_url` — the 264 px WebP the
// upload already makes for the guest menu — and null where there is none; and
// `/pos-uploads/*` is served as immutable, because a URL there never changes
// what it points at (every upload is a fresh `<uuid>.<ext>`).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import sharp from 'sharp';
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
import { saveImageBuffer } from '../pos/uploads.service.js';

describe.skipIf(!hasDb)('POS catalog thumbnails', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let photo = '';

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('thumbs');
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c33' } }).png().toBuffer();
    photo = (await saveImageBuffer(png)).url;

    const withPhoto = await seedProduct(store.storeId, { name: 'Боді з фото' });
    await pool.query(`UPDATE pos_products SET image_url = $1 WHERE id = $2`, [photo, withPhoto.productId]);
    const withSvg = await seedProduct(store.storeId, { name: 'Боді з малюнком' });
    await pool.query(`UPDATE pos_products SET image_url = '/demo-clothing/body.svg' WHERE id = $1`, [withSvg.productId]);
    await seedProduct(store.storeId, { name: 'Боді без фото' });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await pool.end();
  });

  it('carries the thumbnail beside the photo, and null where there is none', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pos/catalog', headers: auth(store.sellerToken) });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ product_name: string; image_url: string | null; thumb_url: string | null }>;
    const byName = new Map(rows.map((r) => [r.product_name, r]));
    expect(byName.get('Боді з фото')?.image_url).toBe(photo);
    expect(byName.get('Боді з фото')?.thumb_url).toBe(photo.replace(/\.png$/, '.t.webp'));
    expect(byName.get('Боді з малюнком')?.thumb_url).toBeNull();
    expect(byName.get('Боді без фото')?.thumb_url).toBeNull();
  });

  it('serves an upload as immutable for a year', async () => {
    const res = await app.inject({ method: 'GET', url: photo.replace(/\.png$/, '.t.webp') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });
});
