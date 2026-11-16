// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.sku-series.test.ts
//
// GET /variants/sku-series — the shop's own article numbering read back out of
// the articles it has given out. `pos.sku-series.test.ts` pins the grouping;
// what is tested here is everything only a real database can answer: that
// archived articles still count as taken, that one store never sees another's
// numbering, and that the tag hint reaches the SQL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  setEnabledModules,
  type TestStore,
} from './helpers/pos-fixtures.js';

type SeriesRow = {
  prefix: string;
  last: string;
  next: string;
  count: number;
  inTag: number;
  samples: string[];
};

describe.skipIf(!hasDb)('GET /variants/sku-series', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  let tagId: number;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('skuser');
    other = await createTestStore('skuoth');
    await setEnabledModules(store.storeId, ['products']);
    await setEnabledModules(other.storeId, ['products']);

    // The digits series. `0042` is archived: its article is still taken, so
    // the next number must be 0043 and not 0018.
    await seedProduct(store.storeId, { name: 'Сукня', sku: '0001' });
    await seedProduct(store.storeId, { name: 'Джинси', sku: '0017' });
    const archived = await seedProduct(store.storeId, { name: 'Пальто', sku: '0042' });
    await pool.query(`UPDATE pos_variants SET is_active = FALSE WHERE id = $1`, [
      archived.variantId,
    ]);

    // The «т» series, filed under a tag of its own.
    const shirt = await seedProduct(store.storeId, { name: 'Футболка', sku: 'т014' });
    const tag = await pool.query(
      `INSERT INTO pos_tags (store_id, name) VALUES ($1, 'Трикотаж') RETURNING id`,
      [store.storeId]
    );
    tagId = Number(tag.rows[0].id);
    await pool.query(`INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2)`, [
      shirt.productId,
      tagId,
    ]);

    // Not a series: digits interleaved, so "the next one" has no meaning.
    await seedProduct(store.storeId, { name: 'Старий', sku: '068-130' });

    // Another store's numbering must never show up in this one's.
    await seedProduct(other.storeId, { name: 'Чужий', sku: '7777' });
  });

  afterAll(async () => {
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await app?.close();
  });

  async function read(query = ''): Promise<SeriesRow[]> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pos/variants/sku-series${query}`,
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(200);
    return res.json().series as SeriesRow[];
  }

  it('continues past an archived article, whose number is still taken', async () => {
    const digits = (await read()).find((s) => s.prefix === '');
    expect(digits).toMatchObject({ last: '0042', next: '0043' });
  });

  it('leaves an article with interleaved digits out of every series', async () => {
    const series = await read();
    expect(series.flatMap((s) => [s.last, s.next])).not.toContain('068-130');
  });

  it('never shows one store the numbering of another', async () => {
    const series = await read();
    expect(series.flatMap((s) => [s.last, s.next])).not.toContain('7777');
  });

  it('ranks by sheer usage when no tag is asked about', async () => {
    const series = await read();
    expect(series[0]!.prefix).toBe('');
    expect(series.every((s) => s.inTag === 0)).toBe(true);
  });

  it('puts the series of the goods already in this category first', async () => {
    // The answer to «а в якій серії цей товар?» — every other knit is «т…».
    const series = await read(`?tag=${tagId}`);
    expect(series[0]).toMatchObject({ prefix: 'т', next: 'т015', inTag: 1 });
    expect(series[1]!.prefix).toBe('');
  });

  it('takes several tags, because a card usually carries several', async () => {
    const series = await read(`?tag=${tagId},999999`);
    expect(series[0]!.prefix).toBe('т');
  });

  it('refuses a tag that is not a number rather than ignoring it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/variants/sku-series?tag=abc',
      headers: auth(store.ownerToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('is owner-only, like the rest of the products surface', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/variants/sku-series',
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(403);
  });
});
