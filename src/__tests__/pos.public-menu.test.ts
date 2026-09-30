// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.test.ts — the guest's QR menu (migration 056),
// end to end through the real POS plugin: the owner's switch, the projection
// that leaves stock and recipes behind, the stop-list that is live within one
// request, and a token that never says whether it ever existed.
// TechDocs/POS_QR_MENU.md.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { createProduct } from '../pos/products.service.js';
import * as modifiers from '../pos/modifiers.service.js';
import { createTag } from '../pos/tags.service.js';
import { createHall, createTable } from '../pos/tables.service.js';
import { localDateString } from '../pos/core/localDate.js';
import { readMigration } from '../pos/migrations.js';
import { resetPublicMenuCache, invalidatePublicMenu } from '../pos/public-menu/menu.service.js';
import { tableMenuUrl, type PublicMenu } from '../pos/public-menu/menu.service.js';
import { qrSvg } from '../pos/public-menu/render.js';

describe.skipIf(!hasDb)('POS guest QR menu', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let other: TestStore;
  let boutique: TestStore;
  let token = '';
  let otherToken = '';
  let teaProduct = 0;
  let cheesecakeVariant = 0;

  const today = localDateString('Europe/Kyiv');

  const enable = (store: TestStore, enabled = true, bearer = store.ownerToken) =>
    app.inject({
      method: 'PATCH',
      url: '/api/pos/store/public-menu',
      headers: auth(bearer),
      payload: { enabled },
    });
  const rotate = (store: TestStore) =>
    app.inject({ method: 'POST', url: '/api/pos/store/public-menu/rotate', headers: auth(store.ownerToken) });
  const page = (t: string, suffix = '') => app.inject({ method: 'GET', url: `/m/${t}${suffix}` });
  const json = (t: string) => app.inject({ method: 'GET', url: `/api/pos/public/menu/${t}` });
  const menu = async (t = token) => (await json(t)).json() as PublicMenu;
  const find = (m: PublicMenu, name: string) =>
    m.categories.flatMap((c) => c.products).find((p) => p.name === name);
  const stop = (productId: number, stopListed: boolean) =>
    app.inject({
      method: 'POST',
      url: `/api/pos/kitchen/stop-list/${productId}`,
      headers: auth(cafe.sellerToken),
      payload: { stop_listed: stopListed },
    });

  async function seedMenu(store: TestStore, prefix: string) {
    const coffee = await createTag(store.storeId, { name: 'Кава', sort_order: 10, show_in_catalog_bar: true });
    const bakery = await createTag(store.storeId, { name: 'Випічка', sort_order: 20, show_in_catalog_bar: true });
    const shelf = await createTag(store.storeId, { name: 'Інгредієнти', sort_order: 60, show_in_catalog_bar: false });
    const tagIt = (productId: number, tagId: number) =>
      pool.query(`INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2)`, [productId, tagId]);
    const add = async (
      name: string,
      variants: Array<{ size?: string; price: number; qty: number }>,
      extra: { description?: string; image_url?: string; sellable?: boolean } = {}
    ) => {
      const card = await createProduct(store.storeId, {
        name: `${prefix}${name}`,
        ...extra,
        variants: variants.map((v) => ({
          attributes: v.size ? { size: v.size } : {},
          price_cents: v.price,
          quantity: v.qty,
        })),
      });
      return card!;
    };

    const oatCard = await createProduct(store.storeId, {
      name: `${prefix}Молоко вівсяне`,
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 100, cost_cents: 4, quantity: 5000 }],
    });
    await tagIt(oatCard!.id, shelf.id);
    const oatVariant = (oatCard!.variants[0] as { id: number }).id;

    const latte = await add(
      'Латте',
      [
        { size: 'S', price: 5000, qty: 10 },
        { size: 'M', price: 6000, qty: 0 },
      ],
      { description: 'Ніжний <b>смак</b>', image_url: 'javascript:alert(1)' }
    );
    await tagIt(latte.id, coffee.id);
    let milk = await modifiers.createGroup(store.storeId, { name: 'Молоко', min_select: 0, max_select: 1 });
    milk = await modifiers.createModifier(store.storeId, milk.id, { name: 'звичайне', is_default: true });
    milk = await modifiers.createModifier(store.storeId, milk.id, {
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: oatVariant,
      component_quantity: 200,
    });
    const empty = await modifiers.createGroup(store.storeId, { name: 'Порожня', min_select: 0, max_select: 1 });
    await modifiers.setProductGroups(store.storeId, latte.id, [milk.id, empty.id]);

    const tea = await add('Чай', [{ price: 4000, qty: 100 }]);
    await tagIt(tea.id, coffee.id);
    const cocoa = await add('Какао', [{ price: 5500, qty: 20 }]);
    await tagIt(cocoa.id, coffee.id);
    const croissant = await add('Круасан', [{ price: 5500, qty: 24 }], { image_url: '/demo-cafe/croissant.svg' });
    await tagIt(croissant.id, bakery.id);
    const cheesecake = await add('Сирник', [{ price: 6500, qty: 0 }]);
    await tagIt(cheesecake.id, bakery.id);
    await add('Вода', [{ price: 3000, qty: 5 }]);
    const evil = await add('<script>alert(1)</script>', [{ price: 1000, qty: 5 }]);
    await tagIt(evil.id, coffee.id);
    return {
      teaProduct: tea.id,
      cocoaProduct: cocoa.id,
      cheesecakeVariant: (cheesecake.variants[0] as { id: number }).id,
    };
  }

  let cocoaProduct = 0;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('pubmenu');
    other = await createTestStore('pubmenu2');
    boutique = await createTestStore('pubmenu3');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = ANY($1::bigint[])`, [
      [cafe.storeId, other.storeId],
    ]);
    const seeded = await seedMenu(cafe, '');
    teaProduct = seeded.teaProduct;
    cocoaProduct = seeded.cocoaProduct;
    cheesecakeVariant = seeded.cheesecakeVariant;
    await seedMenu(other, 'Чужа ');
    // Yesterday's stop-list: a dish stopped a day ago is back on today.
    await pool.query(`UPDATE pos_products SET stop_listed_on = ($2::date - 1) WHERE id = $1`, [
      cocoaProduct,
      today,
    ]);
  }, 60000);

  afterAll(async () => {
    await app?.close();
    for (const store of [cafe, other, boutique]) if (store) await dropTestStore(store.storeId);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the owner’s switch', () => {
    it('is off until the owner turns it on, and the address answers 404 meanwhile', async () => {
      const before = await app.inject({
        method: 'GET',
        url: '/api/pos/store/public-menu',
        headers: auth(cafe.ownerToken),
      });
      expect(before.statusCode).toBe(200);
      // No token yet, so there is nothing to sign a print link for either.
      expect(before.json()).toEqual({
        available: true,
        enabled: false,
        token: null,
        url: null,
        tables: 0,
        bill_enabled: false,
        ordering_enabled: false,
        print: null,
      });
      expect((await page('never_issued_1')).statusCode).toBe(404);
    });

    it('refuses a seller: it is a price list going public, the owner’s call', async () => {
      expect((await enable(cafe, true, cafe.sellerToken)).statusCode).toBe(403);
      const rotateAsSeller = await app.inject({
        method: 'POST',
        url: '/api/pos/store/public-menu/rotate',
        headers: auth(cafe.sellerToken),
      });
      expect(rotateAsSeller.statusCode).toBe(403);
    });

    it('rejects a body that is not a boolean', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store/public-menu',
        headers: auth(cafe.ownerToken),
        payload: { enabled: 'yes' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('issues a random token on first switch-on, never the slug', async () => {
      const res = await enable(cafe);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enabled).toBe(true);
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(body.token).not.toBe(cafe.slug);
      expect(body.url).toMatch(new RegExp(`/m/${body.token}$`));
      token = body.token;
      otherToken = (await enable(other)).json().token;
      expect(otherToken).not.toBe(token);
    });

    it('keeps the token across off and on, so the QR on the tables revives', async () => {
      await enable(cafe, false);
      expect((await page(token)).statusCode).toBe(404);
      const back = await enable(cafe, true);
      expect(back.json().token).toBe(token);
      expect((await page(token)).statusCode).toBe(200);
    });

    it('is a café’s feature: a store with no kitchen gets 409, and nothing is issued', async () => {
      const res = await enable(boutique);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/кав’ярні/);
      expect((await rotate(boutique)).statusCode).toBe(409);
      const row = await pool.query(`SELECT public_menu_token FROM pos_stores WHERE id = $1`, [boutique.storeId]);
      expect(row.rows[0].public_menu_token).toBeNull();
    });

    it('rotating retires every printed QR and leaves the switch where it was', async () => {
      const oldToken = token;
      const res = await rotate(cafe);
      expect(res.statusCode).toBe(200);
      token = res.json().token;
      expect(token).not.toBe(oldToken);
      expect(res.json().enabled).toBe(true);
      expect((await page(oldToken)).statusCode).toBe(404);
      expect((await json(oldToken)).statusCode).toBe(404);
      expect((await page(token)).statusCode).toBe(200);
    });
  });

  describe('a token that never says whether it existed', () => {
    it('answers unknown, malformed, switched-off and rotated tokens with the same page', async () => {
      await enable(other, false);
      const unknown = await page('a_token_nobody_has');
      const malformed = await page('x');
      const off = await page(otherToken);
      await enable(other, true);
      for (const res of [malformed, off]) {
        expect(res.statusCode).toBe(unknown.statusCode);
        expect(res.body).toBe(unknown.body);
      }
      expect(unknown.statusCode).toBe(404);
      expect(unknown.headers['cache-control']).toBe('no-store');
      const unknownJson = await json('a_token_nobody_has');
      const offJson = await (async () => {
        await enable(other, false);
        const r = await json(otherToken);
        await enable(other, true);
        return r;
      })();
      expect(offJson.statusCode).toBe(404);
      expect(offJson.body).toBe(unknownJson.body);
    });

    it('never treats the slug as a key', async () => {
      expect((await page(cafe.slug)).statusCode).toBe(404);
      expect((await json(cafe.slug)).statusCode).toBe(404);
    });

    it('stops publishing when the store stops being a café', async () => {
      await pool.query(`UPDATE pos_stores SET vertical = 'clothing' WHERE id = $1`, [other.storeId]);
      invalidatePublicMenu(other.storeId);
      expect((await page(otherToken)).statusCode).toBe(404);
      await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [other.storeId]);
      invalidatePublicMenu(other.storeId);
      expect((await page(otherToken)).statusCode).toBe(200);
    });
  });

  describe('what the guest is shown', () => {
    it('is a projection: no stock, no recipe, no barcode, no cost, no raw stop day', async () => {
      const res = await json(token);
      expect(res.statusCode).toBe(200);
      const body = res.json() as PublicMenu;
      const latte = find(body, 'Латте')!;

      expect(Object.keys(body).sort()).toEqual(['categories', 'generated_at', 'store', 'store_day']);
      expect(Object.keys(latte).sort()).toEqual([
        'available',
        'description',
        'from_price_cents',
        'id',
        'image_url',
        'modifier_groups',
        'name',
        'stopped',
        'variants',
      ]);
      expect(Object.keys(latte.variants[0]!).sort()).toEqual(['available', 'id', 'label', 'price_cents']);
      // The ids are what a guest's request names an answer by (phase Q6); the
      // ingredient each answer writes off is still not among them.
      expect(Object.keys(latte.modifier_groups[0]!.modifiers[0]!).sort()).toEqual([
        'id',
        'is_default',
        'name',
        'price_delta_cents',
      ]);
      expect(Object.keys(latte.modifier_groups[0]!).sort()).toEqual([
        'id',
        'max_select',
        'min_select',
        'modifiers',
        'name',
      ]);
      for (const leak of ['quantity', 'sku', 'barcode', 'component', 'stop_listed', 'cost', 'store_id', 'station', 'qr_iban']) {
        expect(res.body).not.toContain(leak);
      }
    });

    it('lays the menu out by the till’s bar tags, with the rest in «Інше»', async () => {
      const body = await menu();
      expect(body.categories.map((c) => c.name)).toEqual(['Кава', 'Випічка', 'Інше']);
      expect(body.categories[0]!.products.map((p) => p.name)).toContain('Латте');
      expect(body.categories[1]!.products.map((p) => p.name).sort()).toEqual(['Круасан', 'Сирник']);
      expect(body.categories[2]!.products.map((p) => p.name)).toEqual(['Вода']);
    });

    it('keeps the ingredient shelf and unsellable products off the menu', async () => {
      const body = await menu();
      const names = body.categories.flatMap((c) => c.products.map((p) => p.name));
      expect(names).not.toContain('Молоко вівсяне');
      expect(body.categories.map((c) => c.name)).not.toContain('Інгредієнти');
    });

    it('prices by size, cheapest first, and marks the size that is out', async () => {
      const latte = find(await menu(), 'Латте')!;
      expect(latte.from_price_cents).toBe(5000);
      expect(latte.variants.map((v) => [v.label, v.price_cents, v.available])).toEqual([
        ['S', 5000, true],
        ['M', 6000, false],
      ]);
      // One size is still on: the dish is not «немає».
      expect(latte.available).toBe(true);
      expect(latte.stopped).toBe(false);
    });

    it('carries the answers with their deltas, and only the groups that have answers', async () => {
      const latte = find(await menu(), 'Латте')!;
      expect(latte.modifier_groups.map((g) => g.name)).toEqual(['Молоко']);
      expect(latte.modifier_groups[0]!.modifiers).toEqual([
        { id: expect.any(Number), name: 'звичайне', price_delta_cents: 0, is_default: true },
        { id: expect.any(Number), name: 'вівсяне', price_delta_cents: 1500, is_default: false },
      ]);
    });

    it('shows a dish with no stock as «немає» (not stopped), and keeps it on the page', async () => {
      const cheesecake = find(await menu(), 'Сирник')!;
      expect(cheesecake.available).toBe(false);
      expect(cheesecake.stopped).toBe(false);
    });

    it('passes a site picture through and refuses a javascript: one', async () => {
      const body = await menu();
      expect(find(body, 'Круасан')!.image_url).toBe('/demo-cafe/croissant.svg');
      expect(find(body, 'Латте')!.image_url).toBeNull();
    });

    it('never shows another store’s dishes', async () => {
      const mine = await menu(token);
      const theirs = await menu(otherToken);
      const mineNames = mine.categories.flatMap((c) => c.products.map((p) => p.name));
      const theirNames = theirs.categories.flatMap((c) => c.products.map((p) => p.name));
      expect(mineNames.some((n) => n.startsWith('Чужа '))).toBe(false);
      expect(theirNames.length).toBeGreaterThan(0);
      expect(theirNames.every((n) => n.startsWith('Чужа ') || n === '<script>alert(1)</script>')).toBe(true);
      expect(new Set(mine.categories.flatMap((c) => c.products.map((p) => p.id))).size).toBe(mineNames.length);
      const ids = new Set(mine.categories.flatMap((c) => c.products.map((p) => p.id)));
      for (const p of theirs.categories.flatMap((c) => c.products)) expect(ids.has(p.id)).toBe(false);
    });
  });

  describe('the stop-list', () => {
    it('greys a dish stopped today, and takes it off again, within one request', async () => {
      // Warm the cache first: the toggle must not wait for it to expire.
      expect(find(await menu(), 'Чай')!.stopped).toBe(false);

      expect((await stop(teaProduct, true)).statusCode).toBe(200);
      const stopped = find(await menu(), 'Чай')!;
      expect(stopped.stopped).toBe(true);
      expect(stopped.available).toBe(false);
      expect(stopped.variants.every((v) => !v.available)).toBe(true);

      const html = (await page(token)).body;
      expect(html).toMatch(/data-state="stop">[\s\S]*?<span class="badge">стоп<\/span>/);

      expect((await stop(teaProduct, false)).statusCode).toBe(200);
      const back = find(await menu(), 'Чай')!;
      expect(back.stopped).toBe(false);
      expect(back.available).toBe(true);
    });

    it('counts the store’s day, not yesterday’s: a dish stopped a day ago is on again', async () => {
      const cocoa = find(await menu(), 'Какао')!;
      expect(cocoa.stopped).toBe(false);
      expect(cocoa.available).toBe(true);
    });

    it('lets «стоп» win over «немає» when a dish is both', async () => {
      await stop(teaProduct, true);
      await pool.query(`UPDATE pos_stock SET quantity = 0 WHERE variant_id IN (SELECT id FROM pos_variants WHERE product_id = $1)`, [
        teaProduct,
      ]);
      invalidatePublicMenu(cafe.storeId);
      const html = (await page(token)).body;
      expect(html).toMatch(/data-state="stop">[\s\S]*?<span class="badge">стоп<\/span>/);
      await stop(teaProduct, false);
      await pool.query(`UPDATE pos_stock SET quantity = 100 WHERE variant_id IN (SELECT id FROM pos_variants WHERE product_id = $1)`, [
        teaProduct,
      ]);
      invalidatePublicMenu(cafe.storeId);
    });
  });

  describe('the cache', () => {
    it('answers a repeat from memory, and a change in the DB shows up only after it expires or is invalidated', async () => {
      resetPublicMenuCache();
      expect(find(await menu(), 'Сирник')!.available).toBe(false);

      await pool.query(`UPDATE pos_stock SET quantity = 7 WHERE variant_id = $1`, [cheesecakeVariant]);
      // Cached: the shelf changed, the menu has not noticed yet.
      expect(find(await menu(), 'Сирник')!.available).toBe(false);

      invalidatePublicMenu(cafe.storeId);
      expect(find(await menu(), 'Сирник')!.available).toBe(true);

      // And it expires on its own: 15 s, not forever.
      await pool.query(`UPDATE pos_stock SET quantity = 0 WHERE variant_id = $1`, [cheesecakeVariant]);
      expect(find(await menu(), 'Сирник')!.available).toBe(true);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 16_000);
      expect(find(await menu(), 'Сирник')!.available).toBe(false);
    });

    it('builds once for a crowd that arrives together', async () => {
      resetPublicMenuCache();
      const spy = vi.spyOn(pool, 'query');
      const responses = await Promise.all(Array.from({ length: 8 }, () => json(token)));
      const catalogReads = spy.mock.calls.filter(([sql]) => String(sql).includes('FROM pos_products p')).length;
      spy.mockRestore();
      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      expect(catalogReads).toBeLessThanOrEqual(2);
    });
  });

  describe('the pages', () => {
    it('serves the menu page with a strict CSP, no caching and no indexing', async () => {
      const res = await page(token);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      expect(res.headers['content-security-policy']).not.toContain('unsafe-inline');
    });

    it('escapes an owner’s markup instead of running it', async () => {
      const html = (await page(token)).body;
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Ніжний &lt;b&gt;смак&lt;/b&gt;');
      expect(html).not.toContain('javascript:');
    });

    it('draws a QR card for a published menu, and only for one', async () => {
      const card = await page(token, '/qr');
      expect(card.statusCode).toBe(200);
      expect(card.body).toContain('<svg');
      expect(card.body).toContain(`/m/${token}`);
      expect((await page('a_token_nobody_has', '/qr')).statusCode).toBe(404);
    });

    it('is not a route under the till’s prefix: the JSON stays where the API is', async () => {
      expect((await app.inject({ method: 'GET', url: `/api/pos/m/${token}` })).statusCode).toBe(404);
    });
  });

  describe('the tables (phase Q2)', () => {
    let table5 = 0;
    let table10 = 0;
    let table2 = 0;
    let terrace = 0;
    let retiredTable = 0;
    let retiredHallTable = 0;
    let evilTable = 0;
    let foreignTable = 0;

    beforeAll(async () => {
      const room = await createHall(cafe.storeId, { name: 'Основний зал', sort_order: 10 });
      const patio = await createHall(cafe.storeId, { name: 'Тераса', sort_order: 20 });
      const closed = await createHall(cafe.storeId, { name: 'Закрита', sort_order: 30, is_active: false });
      const t = (hallId: number, name: string, extra: Record<string, unknown> = {}) =>
        createTable(cafe.storeId, { hall_id: hallId, name, ...extra }).then((row) => row.id);
      // Created out of order on purpose: «10» must still print after «5».
      table10 = await t(room.id, '10');
      table5 = await t(room.id, '5');
      table2 = await t(room.id, '2');
      terrace = await t(patio.id, 'Т1');
      retiredTable = await t(room.id, '7', { is_active: false });
      retiredHallTable = await t(closed.id, '99');
      evilTable = await t(room.id, '"><script>alert(1)</script>');
      const elsewhere = await createHall(other.storeId, { name: 'Чужий зал' });
      foreignTable = (await createTable(other.storeId, { hall_id: elsewhere.id, name: 'ЧУЖИЙ-СТІЛ' })).id;
      invalidatePublicMenu(cafe.storeId);
    });

    it('names the table on the menu a table’s QR opens, in its room', async () => {
      const html = (await page(token, `?t=${table5}`)).body;
      expect(html).toContain('<p class="at-table"><b>Стіл 5</b> · Основний зал</p>');
      // …and it is still the whole menu.
      expect(html).toContain('data-product=');
      const terraceHtml = (await page(token, `?t=${terrace}`)).body;
      expect(terraceHtml).toContain('<b>Стіл Т1</b> · Тераса');
    });

    it('does not double the word when the owner already called it «Стіл …»', async () => {
      const named = await createTable(cafe.storeId, {
        hall_id: (await pool.query(`SELECT hall_id FROM pos_tables WHERE id = $1`, [table5])).rows[0].hall_id,
        name: 'Стіл біля вікна',
      });
      const html = (await page(token, `?t=${named.id}`)).body;
      expect(html).toContain('<b>Стіл біля вікна</b>');
      expect(html).not.toContain('Стіл Стіл');
    });

    it('never reads another restaurant’s tables — ids are one sequence for every store', async () => {
      const res = await page(token, `?t=${foreignTable}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('ЧУЖИЙ-СТІЛ');
      expect(res.body).not.toContain('Чужий зал');
      expect(res.body).not.toContain('class="at-table"');
      const sheet = (await page(token, '/tables')).body;
      expect(sheet).not.toContain('ЧУЖИЙ-СТІЛ');
    });

    it('ignores a retired table, a table in a retired room and junk, and still opens the menu', async () => {
      for (const t of [retiredTable, retiredHallTable, 'abc', '1e3', '0', '-5', '5.5', '', '9'.repeat(30), '5 OR 1=1']) {
        const res = await page(token, `?t=${encodeURIComponent(String(t))}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).not.toContain('class="at-table"');
        expect(res.body).toContain('data-product=');
      }
      // A repeated parameter is an array, not an id.
      const twice = await app.inject({ method: 'GET', url: `/m/${token}?t=${table5}&t=${table2}` });
      expect(twice.statusCode).toBe(200);
      expect(twice.body).not.toContain('class="at-table"');
    });

    it('escapes what the owner named a table', async () => {
      const html = (await page(token, `?t=${evilTable}`)).body;
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('draws a card for one table, carrying the table in the address the QR holds', async () => {
      const card = await page(token, `/qr?t=${table5}`);
      expect(card.statusCode).toBe(200);
      expect(card.body).toContain('<b>Стіл 5</b>');
      expect(card.body).toContain(`/m/${token}?t=${table5}`);
      expect(card.body).toContain('<svg');
      // Without a table it is the plain card, as before.
      const plain = (await page(token, '/qr')).body;
      expect(plain).not.toContain('class="seat"');
    });

    it('prints one card per live table, room by room, «2» before «5» before «10»', async () => {
      const res = await page(token, '/tables');
      expect(res.statusCode).toBe(200);
      const html = res.body;
      const order = ['Стіл 2', 'Стіл 5', 'Стіл 10', 'Стіл Т1'].map((label) => html.indexOf(`<b>${label}</b>`));
      expect(order.every((i) => i > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // Live tables only: not the retired table, not the retired room's.
      expect(html).not.toContain('<b>Стіл 7</b>');
      expect(html).not.toContain('<b>Стіл 99</b>');
      // One QR per card, and each one is the QR of ITS table's address (the
      // drawing is deterministic, so the exact SVG can be compared).
      for (const id of [table2, table5, table10, terrace]) {
        expect(html).toContain(qrSvg(tableMenuUrl(token, id)));
      }
      expect((html.match(/<svg/g) ?? []).length).toBe((html.match(/<article class="card table-card">/g) ?? []).length);
      expect(html).toContain('Основний зал');
      expect(html).toContain('Тераса');
    });

    it('answers a sheet for a token that does not work with the same page as everywhere else', async () => {
      const bad = await page('a_token_nobody_has', '/tables');
      const menuBad = await page('a_token_nobody_has');
      expect(bad.statusCode).toBe(404);
      expect(bad.body).toBe(menuBad.body);
    });

    it('says so when a café has no tables yet, instead of printing an empty page', async () => {
      const html = (await page(otherToken, '/tables')).body;
      // `other` has one table (the foreign one above) — use a store with none.
      const bare = await createTestStore('pubmenu4');
      try {
        await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [bare.storeId]);
        const bareToken = (await enable(bare)).json().token;
        const empty = (await page(bareToken, '/tables')).body;
        expect(empty).toContain('Столів ще немає');
        expect(empty).not.toContain('data-print');
      } finally {
        await dropTestStore(bare.storeId);
      }
      expect(html).toContain('ЧУЖИЙ-СТІЛ');
    });

    it('tells the owner how many live tables there are, so the card offers the sheet only when it has something to print', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pos/store/public-menu',
        headers: auth(cafe.ownerToken),
      });
      // 10, 5, 2, Т1, the evil one and «Стіл біля вікна»; not the retired table or the retired room's.
      expect(res.json().tables).toBe(6);
      expect((await enable(cafe, true)).json().tables).toBe(6);
    });

    it('does not put a table into the JSON the page polls: it is one menu', async () => {
      const res = await json(token);
      expect(res.body).not.toContain('Стіл');
      expect(Object.keys(res.json()).sort()).toEqual(['categories', 'generated_at', 'store', 'store_day']);
    });
  });

  describe('migration 056', () => {
    it('does not put a stamped demo café back once its owner changed it', async () => {
      const demo = await pool.query(
        `SELECT id, public_menu_token AS token, public_menu_enabled AS enabled FROM pos_stores WHERE slug = 'demo-cafe'`
      );
      if (demo.rows.length === 0) return; // a database without the demo (never in CI)
      const { id, token: originalToken, enabled } = demo.rows[0];
      try {
        await pool.query(
          `UPDATE pos_stores SET public_menu_token = 'rotated_by_owner_1', public_menu_enabled = FALSE WHERE id = $1`,
          [id]
        );
        await pool.query(readMigration('056_pos_public_menu.sql'));
        const after = await pool.query(
          `SELECT public_menu_token AS token, public_menu_enabled AS enabled FROM pos_stores WHERE id = $1`,
          [id]
        );
        expect(after.rows[0]).toEqual({ token: 'rotated_by_owner_1', enabled: false });
      } finally {
        await pool.query(`UPDATE pos_stores SET public_menu_token = $2, public_menu_enabled = $3 WHERE id = $1`, [
          id,
          originalToken,
          enabled,
        ]);
      }
    });

    it('stamps a demo café that has no token yet, with the well-known one', async () => {
      const demo = await pool.query(
        `SELECT id, public_menu_token AS token, public_menu_enabled AS enabled FROM pos_stores WHERE slug = 'demo-cafe'`
      );
      if (demo.rows.length === 0) return;
      const { id, token: originalToken, enabled } = demo.rows[0];
      try {
        await pool.query(`UPDATE pos_stores SET public_menu_token = NULL, public_menu_enabled = FALSE WHERE id = $1`, [id]);
        await pool.query(readMigration('056_pos_public_menu.sql'));
        const after = await pool.query(
          `SELECT public_menu_token AS token, public_menu_enabled AS enabled FROM pos_stores WHERE id = $1`,
          [id]
        );
        expect(after.rows[0]).toEqual({ token: 'demo-cafe-menu', enabled: true });
      } finally {
        await pool.query(`UPDATE pos_stores SET public_menu_token = $2, public_menu_enabled = $3 WHERE id = $1`, [
          id,
          originalToken,
          enabled,
        ]);
        invalidatePublicMenu(Number(id));
      }
    });
  });
});
