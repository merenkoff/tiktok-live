// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.import-choiceqr.test.ts — «Імпорт з ChoiceQR» end to end
// through `POST /api/pos/super/stores/:id/import/choiceqr` (TechDocs/
// POS_ONBOARDING.md, O2), with the network replaced: the plan, the chunks, the
// photos and the profile, a re-run that creates nothing, and every refusal.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { unlink } from 'fs/promises';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { issueSuperToken } from '../pos/core/superAuth.js';
import { resetMenuImportCache } from '../pos/import/menu-import.service.js';
import { POS_UPLOADS_DIR } from '../pos/uploads.service.js';
import {
  applyPosMigrations,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { choiceQrPage, TINY_PNG } from './helpers/choiceqr-page.js';

const MENU = 'https://test-korchma.choiceqr.com/menu';
const fetched: string[] = [];

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  fetched.push(url);
  if (url === MENU) return Promise.resolve(new Response(choiceQrPage(), { status: 200 }));
  if (url === 'https://moved.choiceqr.com/menu') {
    return Promise.resolve(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
  }
  if (url.startsWith('https://cdn-media.choiceqr.com/')) return Promise.resolve(new Response(TINY_PNG, { status: 200 }));
  return Promise.reject(new Error(`unexpected fetch ${url}`));
}

describe.skipIf(!hasDb)('POST /api/pos/super/stores/:id/import/choiceqr', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let shop: TestStore;
  let token = '';

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = 'correct-horse-battery-staple';
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('cqrcafe');
    shop = await createTestStore('cqrshop');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    token = issueSuperToken()!.token;
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
  }, 120000);

  afterEach(() => {
    fetched.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const files = await pool.query(
      `SELECT image_url AS u FROM pos_products WHERE store_id = $1 AND image_url IS NOT NULL
       UNION ALL SELECT public_logo_url FROM pos_stores WHERE id = $1 AND public_logo_url IS NOT NULL`,
      [cafe.storeId]
    );
    for (const { u } of files.rows) await unlink(path.join(POS_UPLOADS_DIR, path.basename(String(u)))).catch(() => undefined);
    await app?.close();
    await dropTestStore(cafe?.storeId);
    await dropTestStore(shop?.storeId);
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  const post = (storeId: number, payload: Record<string, unknown>, headers: Record<string, string> = { 'x-pos-super-token': token }) =>
    app.inject({ method: 'POST', url: `/api/pos/super/stores/${storeId}/import/choiceqr`, headers, payload });

  it('previews the plan without writing anything', async () => {
    resetMenuImportCache();
    const res = await post(cafe.storeId, { url: MENU });
    expect(res.statusCode).toBe(200);
    expect(res.json().totals).toEqual({ tags_new: 4, products_new: 9, products_existing: 0, variants_new: 11, photos: 3 });
    expect(res.json().place).toMatchObject({ name: 'Тестова корчма', logo: true });
    const count = await pool.query(`SELECT count(*)::int AS n FROM pos_products WHERE store_id = $1`, [cafe.storeId]);
    expect(count.rows[0].n).toBe(0);
    expect(fetched).toEqual([MENU]);
  });

  it('imports in chunks: tags with stations, cards with variants, photos from the media host only, the profile', async () => {
    const chunks = [];
    let offset = 0;
    for (;;) {
      const res = await post(cafe.storeId, { url: MENU, apply: true, offset, limit: 3 });
      expect(res.statusCode).toBe(200);
      chunks.push(res.json());
      if (res.json().done) break;
      offset = res.json().next_offset;
    }
    expect(chunks.map((c) => c.created.length)).toEqual([3, 3, 3]);
    expect(chunks[0].profile).toEqual(['адреса', 'телефон', 'години роботи', 'логотип']);
    // The photo hosted elsewhere is never requested — it is reported instead.
    expect(chunks.flatMap((c) => c.photos_failed)).toEqual(['Гетьман']);
    expect(fetched.some((u) => u.includes('evil.example'))).toBe(false);

    const tags = await pool.query(
      `SELECT name, station, show_in_catalog_bar FROM pos_tags WHERE store_id = $1 ORDER BY sort_order`,
      [cafe.storeId]
    );
    expect(tags.rows).toEqual([
      { name: 'Перші страви', station: 'kitchen', show_in_catalog_bar: true },
      { name: 'Холодні напої', station: 'bar', show_in_catalog_bar: true },
      { name: 'Горілка', station: 'bar', show_in_catalog_bar: true },
      { name: 'Гарнір', station: 'kitchen', show_in_catalog_bar: true },
    ]);

    const rows = await pool.query(
      `SELECT p.name, p.kind, p.description, p.image_url, t.name AS tag,
              v.label, v.unit, v.price_cents, s.quantity
         FROM pos_products p
         JOIN pos_product_tags pt ON pt.product_id = p.id JOIN pos_tags t ON t.id = pt.tag_id
         JOIN pos_variants v ON v.product_id = p.id LEFT JOIN pos_stock s ON s.variant_id = v.id
        WHERE p.store_id = $1 ORDER BY p.id, v.id`,
      [cafe.storeId]
    );
    const vzvar = rows.rows.filter((r) => r.name === 'Взвар');
    expect(vzvar.map((r) => [r.label, r.price_cents, r.quantity])).toEqual([
      ['1 л', 11000, 0],
      ['300 мл', 4000, 0],
    ]);
    expect(vzvar[0]).toMatchObject({ kind: 'simple', unit: 'шт', tag: 'Холодні напої' });
    expect(vzvar[0].image_url).toMatch(/^\/pos-uploads\/[0-9a-f-]+\.png$/);
    expect(rows.rows.find((r) => r.name === 'Борщ')).toMatchObject({ description: 'з пампушкою', label: '300 г' });
    expect(rows.rows.find((r) => r.name === 'Гетьман')?.image_url).toBeNull();
    expect(rows.rows.filter((r) => r.name.startsWith('Печена картопля')).map((r) => [r.name, r.price_cents])).toEqual([
      ['Печена картопля', 11500],
      ['Печена картопля (2)', 15500],
    ]);

    const profile = (await pool.query(`SELECT public_address, public_phone, public_hours, public_logo_url FROM pos_stores WHERE id = $1`, [cafe.storeId])).rows[0];
    expect(profile.public_address).toBe('м. Тест, вул. Вигадана, 1');
    expect(profile.public_hours['7']).toEqual({ open: '12:00', close: '20:00' });
    expect(profile.public_hours['6']).toBeUndefined();
    expect(profile.public_logo_url).toMatch(/^\/pos-uploads\//);
  });

  it('runs again without creating anything twice, and leaves the owner’s profile alone', async () => {
    await pool.query(`UPDATE pos_stores SET public_address = 'Своя адреса' WHERE id = $1`, [cafe.storeId]);
    const preview = await post(cafe.storeId, { url: MENU });
    expect(preview.json().totals).toMatchObject({ tags_new: 0, products_new: 0, products_existing: 9 });
    const again = await post(cafe.storeId, { url: MENU, apply: true, offset: 0, limit: 40 });
    expect(again.json()).toMatchObject({ created: [], skipped_existing: 9, profile: [], done: true });
    const count = await pool.query(`SELECT count(*)::int AS n FROM pos_products WHERE store_id = $1`, [cafe.storeId]);
    expect(count.rows[0].n).toBe(9);
    const address = await pool.query(`SELECT public_address FROM pos_stores WHERE id = $1`, [cafe.storeId]);
    expect(address.rows[0].public_address).toBe('Своя адреса');
  });

  it('refuses in words: not ChoiceQR, a redirect, a store without a kitchen, no address', async () => {
    const notChoice = await post(cafe.storeId, { url: 'https://evil.example/menu' });
    expect(notChoice.statusCode).toBe(400);
    expect(notChoice.json().error).toMatch(/меню ChoiceQR/);
    const redirect = await post(cafe.storeId, { url: 'https://moved.choiceqr.com/menu' });
    expect(redirect.statusCode).toBe(400);
    expect(redirect.json().error).toMatch(/переадресацією/);
    expect(fetched).not.toContain('http://169.254.169.254/');
    const clothing = await post(shop.storeId, { url: MENU });
    expect(clothing.statusCode).toBe(400);
    expect(clothing.json().error).toMatch(/для кафе й ресторанів/);
    expect((await post(cafe.storeId, {})).statusCode).toBe(400);
  });

  it('is the super admin’s alone', async () => {
    const res = await post(cafe.storeId, { url: MENU }, {});
    expect(res.statusCode).toBe(401);
  });
});
