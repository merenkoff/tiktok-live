// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Mass markdown (clothing D2): the percentage comes off the ORIGINAL price,
// a variant already in a live markdown is refused, and ending a markdown
// restores only the variants the owner has not retyped since.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  createMarkdown,
  endExpiredMarkdowns,
  endMarkdown,
  listMarkdowns,
  markdownPrice,
  normalizeMarkdownInput,
  previewMarkdown,
} from '../pos/markdowns.service.js';
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

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

describe('markdownPrice — percent off, rounded to the unit the shop prices in', () => {
  it('rounds to the hryvnia by default and to ten when asked', () => {
    expect(markdownPrice(159_000, 30, 100)).toBe(111_300);
    expect(markdownPrice(159_000, 30, 1000)).toBe(111_000);
    expect(markdownPrice(79_000, 30, 1000)).toBe(55_000);
    expect(markdownPrice(79_000, 30, 1)).toBe(55_300);
  });

  it('can round a cheap item away entirely — which the plan then refuses', () => {
    expect(markdownPrice(500, 30, 1000)).toBe(0);
  });
});

describe('normalizeMarkdownInput — in the owner\'s words', () => {
  const ok = { product_ids: [1, 2, 2], percent: 30 };
  it('dedupes products and fills the defaults', () => {
    expect(normalizeMarkdownInput(ok, '2026-10-04')).toEqual({
      productIds: [1, 2],
      percent: 30,
      rounding: 100,
      endsOn: null,
      name: '',
    });
  });
  it('refuses a percent that is not a whole 1..99', () => {
    for (const percent of [0, 100, 12.5, NaN]) {
      expect(() => normalizeMarkdownInput({ ...ok, percent }, '2026-10-04')).toThrow(/від 1 до 99/);
    }
  });
  it('refuses an unknown rounding and a date in the past, keeps today', () => {
    expect(() => normalizeMarkdownInput({ ...ok, rounding: 50 as never }, '2026-10-04')).toThrow(/Округлення/);
    expect(() => normalizeMarkdownInput({ ...ok, ends_on: '2026-10-03' }, '2026-10-04')).toThrow(/вже минула/);
    expect(() => normalizeMarkdownInput({ ...ok, ends_on: '2026-13-40' }, '2026-10-04')).toThrow(/РРРР-ММ-ДД/);
    expect(normalizeMarkdownInput({ ...ok, ends_on: '2026-10-04' }, '2026-10-04').endsOn).toBe('2026-10-04');
  });
  it('refuses an empty selection', () => {
    expect(() => normalizeMarkdownInput({ product_ids: [], percent: 30 }, '2026-10-04')).toThrow(/Оберіть товари/);
  });
});

describe.skipIf(!hasDb)('mass markdown over a store', () => {
  let store: TestStore;
  let storeId: number;
  let coat: { productId: number; variantId: number };
  let cap: { productId: number; variantId: number };
  let scarf: { productId: number; variantId: number };
  let bouquet: { productId: number; variantId: number };

  async function variant(id: number) {
    const r = await pool.query(`SELECT price_cents, compare_at_cents FROM pos_variants WHERE id = $1`, [id]);
    return {
      price: Number(r.rows[0].price_cents),
      old: r.rows[0].compare_at_cents == null ? null : Number(r.rows[0].compare_at_cents),
    };
  }

  beforeAll(async () => {
    await applyPosMigrations();
    store = await createTestStore('markdown');
    storeId = store.storeId;
    coat = await seedProduct(storeId, { name: 'Пальто', priceCents: 159_000, quantity: 5 });
    cap = await seedProduct(storeId, { name: 'Кепка', priceCents: 79_000, quantity: 5 });
    // Already marked down by hand: 600 → 450.
    scarf = await seedProduct(storeId, { name: 'Шарф', priceCents: 45_000, quantity: 5 });
    await pool.query(`UPDATE pos_variants SET compare_at_cents = 60_000 WHERE id = $1`, [scarf.variantId]);
    // A derived composite is priced from its components at the till; its
    // card price is not a price anyone pays.
    bouquet = await seedProduct(storeId, { name: 'Букет', priceCents: 100_000, quantity: 0 });
    await pool.query(`UPDATE pos_products SET kind = 'composite', stock_mode = 'derived' WHERE id = $1`, [
      bouquet.productId,
    ]);
  });

  afterAll(async () => {
    await dropTestStore(storeId);
  });

  it('previews without writing: the percent comes off the original price, the derived composite is skipped', async () => {
    const preview = await previewMarkdown(storeId, {
      product_ids: [coat.productId, cap.productId, scarf.productId, bouquet.productId],
      percent: 30,
      rounding: 1000,
    });
    expect(preview.products).toBe(3);
    expect(preview.items.map((i) => [i.product_name, i.price_before, i.price_after, i.compare_at_after])).toEqual([
      ['Кепка', 79_000, 55_000, 79_000],
      ['Пальто', 159_000, 111_000, 159_000],
      // 30 % off 600, not off 450 — and the old price on the tag stays 600.
      ['Шарф', 45_000, 42_000, 60_000],
    ]);
    expect(preview.skipped).toEqual([
      { variant_id: bouquet.variantId, product_name: 'Букет', label: expect.any(String), reason: 'derived' },
    ]);
    expect(await variant(coat.variantId)).toEqual({ price: 159_000, old: null });
  });

  let markdownId: number;

  it('applies in one go and records the snapshot', async () => {
    const created = await createMarkdown(storeId, store.ownerId, {
      product_ids: [coat.productId, cap.productId, scarf.productId, bouquet.productId],
      percent: 30,
      rounding: 1000,
      name: 'Осінь',
      ends_on: today(),
    });
    markdownId = created.markdown.id;
    expect(created.applied).toBe(3);
    expect(created.skipped.map((s) => s.reason)).toEqual(['derived']);
    expect(created.markdown).toMatchObject({
      name: 'Осінь',
      percent: 30,
      rounding: 1000,
      ends_on: today(),
      ended_at: null,
      items: 3,
      products: 3,
      restored: null,
      skipped: null,
    });
    expect(await variant(coat.variantId)).toEqual({ price: 111_000, old: 159_000 });
    expect(await variant(scarf.variantId)).toEqual({ price: 42_000, old: 60_000 });
    expect(await variant(bouquet.variantId)).toEqual({ price: 100_000, old: null });
  });

  it('refuses to put a variant into a second live markdown, naming the first', async () => {
    const preview = await previewMarkdown(storeId, { product_ids: [coat.productId], percent: 50 });
    expect(preview.items).toEqual([]);
    expect(preview.skipped[0]).toMatchObject({ reason: 'in_markdown', markdown_name: 'Осінь' });
    await expect(createMarkdown(storeId, store.ownerId, { product_ids: [coat.productId], percent: 50 })).rejects.toThrow(
      /вже в уцінці/
    );
    expect(await variant(coat.variantId)).toEqual({ price: 111_000, old: 159_000 });
  });

  it('refuses a markdown that would leave nothing to pay', async () => {
    const cheap = await seedProduct(storeId, { name: 'Шнурки', priceCents: 500, quantity: 5 });
    await expect(
      createMarkdown(storeId, store.ownerId, { product_ids: [cheap.productId], percent: 30, rounding: 1000 })
    ).rejects.toThrow(/Немає що уцінювати/);
    expect(await variant(cheap.variantId)).toEqual({ price: 500, old: null });
  });

  it('does not end a markdown that is live through today', async () => {
    expect(await endExpiredMarkdowns()).toBe(0);
    expect((await listMarkdowns(storeId))[0]).toMatchObject({ id: markdownId, ended_at: null });
  });

  it('ending restores what was recorded and leaves a variant the owner retyped since', async () => {
    // The owner changed the cap by hand after the markdown: it is theirs now.
    await pool.query(`UPDATE pos_variants SET price_cents = 69_900 WHERE id = $1`, [cap.variantId]);

    const ended = await endMarkdown(storeId, markdownId, store.ownerId, 'manual');
    expect(ended).toEqual({ restored: 2, skipped: 1, already: false });
    expect(await variant(coat.variantId)).toEqual({ price: 159_000, old: null });
    expect(await variant(scarf.variantId)).toEqual({ price: 45_000, old: 60_000 });
    expect(await variant(cap.variantId)).toEqual({ price: 69_900, old: 79_000 });

    const view = (await listMarkdowns(storeId)).find((m) => m.id === markdownId)!;
    expect(view).toMatchObject({ ended_reason: 'manual', restored: 2, skipped: 1 });
    // A second tap reports the same counts and touches nothing.
    expect(await endMarkdown(storeId, markdownId, store.ownerId, 'manual')).toEqual({
      restored: 2,
      skipped: 1,
      already: true,
    });
    expect(await variant(coat.variantId)).toEqual({ price: 159_000, old: null });
  });

  it('the cron ends a markdown once its store-local day has passed', async () => {
    const created = await createMarkdown(storeId, store.ownerId, {
      product_ids: [coat.productId],
      percent: 20,
      ends_on: today(),
    });
    expect(await variant(coat.variantId)).toEqual({ price: 127_200, old: 159_000 });
    expect(await endExpiredMarkdowns()).toBe(0);
    // Tomorrow, from the store's point of view.
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000);
    expect(await endExpiredMarkdowns(tomorrow)).toBe(1);
    expect(await variant(coat.variantId)).toEqual({ price: 159_000, old: null });
    const view = (await listMarkdowns(storeId)).find((m) => m.id === created.markdown.id)!;
    expect(view).toMatchObject({ ended_reason: 'expired', restored: 1, skipped: 0 });
  });

  it('lists live markdowns first, then the ended ones, newest first', async () => {
    const live = await createMarkdown(storeId, store.ownerId, { product_ids: [cap.productId], percent: 10 });
    const list = await listMarkdowns(storeId);
    expect(list[0]!.id).toBe(live.markdown.id);
    expect(list.slice(1).every((m) => m.ended_at != null)).toBe(true);
    await endMarkdown(storeId, live.markdown.id, store.ownerId, 'manual');
  });

  describe('routes', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildPosTestApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('are owner-only', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pos/markdowns', headers: auth(store.sellerToken) });
      expect(res.statusCode).toBe(403);
    });

    it('preview, apply and end through the API, refusing bad input in words', async () => {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/pos/markdowns',
        headers: auth(store.ownerToken),
        payload: { product_ids: [coat.productId], percent: 150 },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toMatch(/від 1 до 99/);

      const preview = await app.inject({
        method: 'POST',
        url: '/api/pos/markdowns/preview',
        headers: auth(store.ownerToken),
        payload: { product_ids: [coat.productId], percent: 25 },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().items[0]).toMatchObject({ price_after: 119_300 });

      const created = await app.inject({
        method: 'POST',
        url: '/api/pos/markdowns',
        headers: auth(store.ownerToken),
        payload: { product_ids: [coat.productId], percent: 25 },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().markdown.id as number;
      expect((await app.inject({ method: 'GET', url: '/api/pos/markdowns', headers: auth(store.ownerToken) })).json()[0].id).toBe(id);

      const missing = await app.inject({
        method: 'POST',
        url: `/api/pos/markdowns/999999/end`,
        headers: auth(store.ownerToken),
      });
      expect(missing.statusCode).toBe(404);

      const ended = await app.inject({ method: 'POST', url: `/api/pos/markdowns/${id}/end`, headers: auth(store.ownerToken) });
      expect(ended.statusCode).toBe(200);
      expect(ended.json()).toEqual({ restored: 1, skipped: 0, already: false });
    });
  });
});
