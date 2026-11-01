// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.dishfacts.test.ts — what a dish says about what
// is in it: the owner's line of composition and the allergens they ticked
// (migration 060, TechDocs/POS_QR_MENU.md phase Q3b), the labels (086, F9) and
// the facts line's numbers — calories, strength, minutes (087, F14). The first
// half is pure; the second drives the real POS plugin.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { readMigration } from '../pos/migrations.js';
import { invalidatePublicMenu, type PublicMenu, type PublicMenuProduct } from '../pos/public-menu/menu.service.js';
import { renderMenuPage } from '../pos/public-menu/render.js';
import {
  ALLERGENS,
  AllergenError,
  COMPOSITION_MAX,
  allergenLabels,
  normalizeAllergens,
  normalizeComposition,
} from '../pos/allergens.js';
import {
  ALLERGENS as CLIENT_ALLERGENS,
  COMPOSITION_MAX as CLIENT_COMPOSITION_MAX,
} from '../../pos/src/modules/products/components/allergens.js';
import { MENU_LABELS, MenuLabelError, menuLabelItems, normalizeMenuLabels } from '../pos/menu-labels.js';
import { MENU_LABELS as CLIENT_MENU_LABELS } from '../../pos/src/modules/products/components/menuLabels.js';
import {
  DishFactsError,
  KCAL_MAX,
  normalizeKcal,
  normalizePrepMinutes,
  normalizeStrengthTenths,
  strengthPercentText,
} from '../pos/dish-facts.js';
import { dishFactsParts } from '../pos/public-menu/format.js';
import { POS_UPLOADS_DIR, saveImageBuffer, thumbNameOf, thumbUrlOf } from '../pos/uploads.service.js';
import { TINY_PNG } from './helpers/choiceqr-page.js';
import { unlink } from 'fs/promises';
import path from 'path';

describe('the allergen list', () => {
  it('is the fourteen of Regulation (EU) 1169/2011 Annex II, each once, each with a label', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS.map((a) => a.code)).size).toBe(14);
    expect(ALLERGENS.every((a) => /^[a-z]+$/.test(a.code) && a.label.length > 0)).toBe(true);
    expect(ALLERGENS.map((a) => a.code)).toEqual([
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
      'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
    ]);
  });

  it('puts a chosen set in canonical order without repeats, and reads nothing as the empty set', () => {
    expect(normalizeAllergens(['milk', 'gluten', 'milk', 'eggs'])).toEqual(['gluten', 'eggs', 'milk']);
    expect(normalizeAllergens([])).toEqual([]);
    expect(normalizeAllergens(null)).toEqual([]);
    expect(normalizeAllergens(undefined)).toEqual([]);
  });

  it.each([
    ['a code that is not on the list', ['milk', 'chocolate']],
    ['a capitalised code', ['Milk']],
    ['a label instead of a code', ['Молоко']],
    ['a non-string entry', ['milk', 7]],
    ['a string instead of a list', 'milk'],
    ['an object', { milk: true }],
  ])('refuses %s', (_label, value) => {
    expect(() => normalizeAllergens(value)).toThrow(AllergenError);
  });

  it('turns a stored set into labels in canonical order and drops codes it does not know', () => {
    expect(allergenLabels(['milk', 'gluten', 'retired_code'])).toEqual([
      { code: 'gluten', label: 'Глютен' },
      { code: 'milk', label: 'Молоко' },
    ]);
    expect(allergenLabels(null)).toEqual([]);
    expect(allergenLabels([])).toEqual([]);
  });
});

describe('the client’s copy of the list', () => {
  // `rootDir` keeps the two apps from importing each other, so the owner's form
  // carries its own copy of the list; this is what keeps the copy honest.
  it('says exactly what the server says: the same codes, labels, order and limit', () => {
    expect(CLIENT_ALLERGENS.map((a) => ({ ...a }))).toEqual(ALLERGENS.map((a) => ({ ...a })));
    expect(CLIENT_COMPOSITION_MAX).toBe(COMPOSITION_MAX);
  });
});

describe('the dish labels (F9)', () => {
  it('are the six, each once, in the order the guest reads them — and none claims an allergen is absent', () => {
    expect(MENU_LABELS.map((l) => l.code)).toEqual(['spicy', 'vegetarian', 'vegan', 'new', 'hit', 'recommended']);
    expect(MENU_LABELS.every((l) => /^[a-z]+$/.test(l.code) && l.label.length > 0)).toBe(true);
    expect(MENU_LABELS.some((l) => /глютен/i.test(l.label))).toBe(false);
  });

  it('puts a chosen set in canonical order without repeats, and reads nothing as the empty set', () => {
    expect(normalizeMenuLabels(['hit', 'spicy', 'hit', 'new'])).toEqual(['spicy', 'new', 'hit']);
    expect(normalizeMenuLabels([])).toEqual([]);
    expect(normalizeMenuLabels(null)).toEqual([]);
    expect(normalizeMenuLabels(undefined)).toEqual([]);
  });

  it.each([
    ['a code that is not on the list', ['spicy', 'gluten-free']],
    ['ChoiceQR’s own code', ['middle-spicy']],
    ['a capitalised code', ['Spicy']],
    ['a label instead of a code', ['Гостре']],
    ['a non-string entry', ['spicy', 7]],
    ['a string instead of a list', 'spicy'],
  ])('refuses %s', (_label, value) => {
    expect(() => normalizeMenuLabels(value)).toThrow(MenuLabelError);
  });

  it('turns a stored set into code + word in canonical order and drops codes it does not know', () => {
    expect(menuLabelItems(['hit', 'spicy', 'retired_code'])).toEqual([
      { code: 'spicy', label: 'Гостре' },
      { code: 'hit', label: 'Хіт' },
    ]);
    expect(menuLabelItems(null)).toEqual([]);
  });

  it('is the same list on the owner’s form: the client’s copy says what the server says', () => {
    expect(CLIENT_MENU_LABELS.map((l) => ({ ...l }))).toEqual(MENU_LABELS.map((l) => ({ ...l })));
  });
});

describe('the facts line’s numbers (F14)', () => {
  it('reads a count as a whole number in range, blank and null as «not said», and refuses the rest in words', () => {
    expect(normalizeKcal(420)).toBe(420);
    expect(normalizeKcal('420')).toBe(420);
    expect(normalizeKcal(' 0 ')).toBe(0);
    expect(normalizeKcal('')).toBeNull();
    expect(normalizeKcal(null)).toBeNull();
    expect(normalizeKcal(undefined)).toBeNull();
    for (const bad of [-1, KCAL_MAX + 1, 1.5, '12a', 'abc', '4,5', true, {}]) {
      expect(() => normalizeKcal(bad), String(bad)).toThrow(DishFactsError);
    }
    expect(() => normalizeKcal(99999)).toThrow(`Калорійність: ціле число від 0 до ${KCAL_MAX}`);
    expect(normalizePrepMinutes('25')).toBe(25);
    expect(normalizePrepMinutes(600)).toBe(600);
    for (const bad of [0, 601, 2.5, '-1', 'пів години']) {
      expect(() => normalizePrepMinutes(bad), String(bad)).toThrow('Час приготування: ціле число хвилин від 1 до 600');
    }
  });

  it('keeps the strength in tenths: the importer sends tenths, the form a percent with a comma', () => {
    expect(normalizeStrengthTenths(45)).toBe(45);
    expect(normalizeStrengthTenths('400')).toBe(400);
    expect(normalizeStrengthTenths(0)).toBe(0);
    expect(normalizeStrengthTenths(null)).toBeNull();
    expect(normalizeStrengthTenths('4,5', { percent: true })).toBe(45);
    expect(normalizeStrengthTenths('4.5', { percent: true })).toBe(45);
    expect(normalizeStrengthTenths('40', { percent: true })).toBe(400);
    expect(normalizeStrengthTenths(13, { percent: true })).toBe(130);
    expect(normalizeStrengthTenths('', { percent: true })).toBeNull();
    for (const bad of [1001, 4.5, '-1']) expect(() => normalizeStrengthTenths(bad), String(bad)).toThrow(DishFactsError);
    for (const bad of ['101', '4,55', '-4', 'міцне']) {
      expect(() => normalizeStrengthTenths(bad, { percent: true }), bad).toThrow(
        'Міцність: число від 0 до 100 %, не більше однієї цифри після коми'
      );
    }
    expect(strengthPercentText(45)).toBe('4,5 %');
    expect(strengthPercentText(400)).toBe('40 %');
    expect(strengthPercentText(0)).toBe('0 %');
  });

  it('prints them as whole words in the guest’s order, «на порцію» only where the sheet asks for it', () => {
    expect(dishFactsParts({ kcal: 420, strength_tenths: null, prep_minutes: 25 })).toEqual(['420 ккал', 'готується ≈ 25 хв']);
    expect(dishFactsParts({ kcal: 125, strength_tenths: 130, prep_minutes: null }, true)).toEqual(['125 ккал на порцію', 'міцність 13 %']);
    expect(dishFactsParts({ kcal: null, strength_tenths: 0, prep_minutes: null })).toEqual(['міцність 0 %']);
    expect(dishFactsParts({ kcal: null, strength_tenths: null, prep_minutes: null })).toEqual([]);
  });
});

describe('the composition line', () => {
  it('is one trimmed line: breaks and control characters become spaces', () => {
    expect(normalizeComposition('  Еспресо,\n молоко\t\u0000 ')).toBe('Еспресо, молоко');
  });

  it('reads blank and null as «not said»; refuses a non-string and a novel', () => {
    expect(normalizeComposition('   ')).toBeNull();
    expect(normalizeComposition(null)).toBeNull();
    expect(normalizeComposition(undefined)).toBeNull();
    expect(() => normalizeComposition(5)).toThrow(AllergenError);
    expect(normalizeComposition('а'.repeat(COMPOSITION_MAX))).toHaveLength(COMPOSITION_MAX);
    expect(() => normalizeComposition('а'.repeat(COMPOSITION_MAX + 1))).toThrow(AllergenError);
  });
});

describe('the guest page', () => {
  const dish = (over: Partial<PublicMenuProduct> = {}): PublicMenuProduct => ({
    id: 7,
    name: 'Латте',
    description: '',
    composition: '',
    allergens: [],
    labels: [],
    kcal: null,
    strength_tenths: null,
    prep_minutes: null,
    image_url: null,
    thumb_url: null,
    stopped: false,
    available: true,
    from_price_cents: 5000,
    variants: [{ id: 70, label: '', price_cents: 5000, available: true }],
    modifier_groups: [],
    ...over,
  });
  const menuOf = (...products: PublicMenuProduct[]): PublicMenu => ({
    store: { name: 'Кав’ярня', logo_url: null, address: null, phone: null, hours_today: null, hours: [], email: null, instagram: null, facebook: null, tiktok: null, google_url: null, corkage: null, feedback_enabled: false },
    rev: 'a1b2c3d4e5f6',
    store_day: '2026-09-30',
    generated_at: '2026-09-30T08:00:00.000Z',
    categories: [{ id: 1, name: 'Кава', products }],
  });

  it('prints the composition and the ticked allergens under the dish, with the note about who wrote them', () => {
    const html = renderMenuPage(
      menuOf(
        dish({
          composition: 'Еспресо, молоко',
          allergens: [
            { code: 'gluten', label: 'Глютен' },
            { code: 'milk', label: 'Молоко' },
          ],
        })
      ),
      'tok_12345678'
    );
    expect(html).toContain('<p class="comp"><b>Склад:</b> Еспресо, молоко</p>');
    expect(html).toContain('<ul class="allergens" aria-label="Містить алергени"><li>Глютен</li><li>Молоко</li></ul>');
    expect(html).toContain('Склад і алергени вказує заклад. Якщо у вас алергія — скажіть офіціанту.');
  });

  it('says nothing about a dish whose owner said nothing — and no note when nothing needs one', () => {
    const html = renderMenuPage(menuOf(dish()), 'tok_12345678');
    expect(html).not.toContain('class="comp"');
    expect(html).not.toContain('class="allergens"');
    expect(html).not.toContain('class="labels"');
    expect(html).not.toContain('Склад і алергени вказує заклад');
  });

  it('draws the labels as chips between the name and the description — a glyph and the word, one class per code', () => {
    const html = renderMenuPage(
      menuOf(
        dish({
          description: 'Наш борщ',
          labels: [
            { code: 'spicy', label: 'Гостре' },
            { code: 'hit', label: 'Хіт' },
          ],
        })
      ),
      'tok_12345678'
    );
    const chips = html.match(/<ul class="labels" aria-label="Позначки страви">.*?<\/ul>/)![0];
    expect(chips).toMatch(/^<ul class="labels" aria-label="Позначки страви"><li class="label label-spicy"><svg [^>]*aria-hidden="true">.*?<\/svg><span>Гостре<\/span><\/li><li class="label label-hit"><svg .*?<\/svg><span>Хіт<\/span><\/li><\/ul>$/);
    expect(html.indexOf('</h3>')).toBeLessThan(html.indexOf(chips));
    expect(html.indexOf(chips)).toBeLessThan(html.indexOf('<p class="desc">Наш борщ</p>'));
    // The sheet's frame carries one glyph template per code, for the script to clone.
    for (const code of ['spicy', 'vegetarian', 'vegan', 'new', 'hit', 'recommended']) {
      expect(html.match(new RegExp(`<template data-label-glyph="${code}"><svg `, 'g'))).toHaveLength(1);
    }
    expect(html).toContain('<ul class="labels dish-labels" data-dish-labels aria-label="Позначки страви" hidden></ul>');
  });

  it('prints the facts line under the price — the size first, then the numbers — and nothing when there is none (F14)', () => {
    const html = renderMenuPage(
      menuOf(
        dish({ kcal: 420, prep_minutes: 25, variants: [{ id: 70, label: ' 245 г ', price_cents: 5000, available: true }] }),
        dish({ id: 8, name: 'Пиво', kcal: 150, strength_tenths: 45, variants: [{ id: 80, label: '0,5 л', price_cents: 7000, available: true }] }),
        dish({ id: 9, name: 'Вода', strength_tenths: 0 }),
        dish({
          id: 10,
          name: 'Піца',
          prep_minutes: 20,
          from_price_cents: 20000,
          variants: [
            { id: 100, label: '30 см', price_cents: 20000, available: true },
            { id: 101, label: '50 см', price_cents: 30000, available: true },
          ],
        })
      ),
      'tok_12345678'
    );
    expect(html).toContain('<p class="price">50 ₴</p><p class="facts">245 г · 420 ккал · готується ≈ 25 хв</p>');
    expect(html).toContain('<p class="facts">0,5 л · 150 ккал · міцність 4,5 %</p>');
    expect(html).toContain('<p class="facts">міцність 0 %</p>');
    // Two sizes: no size on the line (the sizes list follows), the number still there.
    expect(html).toContain('<p class="price">від 200 ₴</p><p class="facts">готується ≈ 20 хв</p><ul class="sizes">');
    expect(renderMenuPage(menuOf(dish()), 'tok_12345678')).not.toContain('class="facts"');
  });

  it('loads the thumbnail on the card where there is one and the photo otherwise, at the card’s own size (F10)', () => {
    const html = renderMenuPage(
      menuOf(
        dish({ image_url: '/pos-uploads/a.jpg', thumb_url: '/pos-uploads/a.t.webp' }),
        dish({ id: 8, name: 'Чай', image_url: '/demo-cafe/tea.svg' })
      ),
      'tok_12345678'
    );
    expect(html).toContain('<div class="pic"><img src="/pos-uploads/a.t.webp" width="88" height="88" alt="" loading="lazy" decoding="async"></div>');
    expect(html).toContain('<div class="pic"><img src="/demo-cafe/tea.svg" width="88" height="88" alt="" loading="lazy" decoding="async"></div>');
    expect(html).not.toContain('a.jpg');
  });

  it('escapes a label’s word and skips a code it has no glyph for', () => {
    const html = renderMenuPage(
      menuOf(dish({ labels: [{ code: 'spicy', label: '<b>Гостре</b>' }, { code: 'halal', label: 'Халяль' }] })),
      'tok_12345678'
    );
    expect(html).toContain('<span>&lt;b&gt;Гостре&lt;/b&gt;</span>');
    expect(html).not.toContain('label-halal');
    expect(html).not.toContain('Халяль');
  });

  it('prints the note once, however many dishes carry facts', () => {
    const html = renderMenuPage(
      menuOf(
        dish({ composition: 'а' }),
        dish({ id: 8, name: 'Чай', allergens: [{ code: 'milk', label: 'Молоко' }] })
      ),
      'tok_12345678'
    );
    expect(html.match(/Склад і алергени вказує заклад/g)).toHaveLength(1);
  });

  it('escapes what an owner typed and carries the content fingerprint for the script', () => {
    const html = renderMenuPage(
      menuOf(dish({ composition: '<script>alert(1)</script> "x"', allergens: [{ code: 'milk', label: '<b>Молоко</b>' }] })),
      'tok_12345678'
    );
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot;');
    expect(html).toContain('<li>&lt;b&gt;Молоко&lt;/b&gt;</li>');
    expect(html).toContain(' data-rev="a1b2c3d4e5f6"');
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)('dish facts through the API', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let token = '';

  const menu = async () =>
    (await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` })).json() as PublicMenu;
  const dishOf = (m: PublicMenu, name: string) =>
    m.categories.flatMap((c) => c.products).find((p) => p.name === name);
  const post = (payload: Record<string, unknown>, bearer = cafe.ownerToken) =>
    app.inject({ method: 'POST', url: '/api/pos/products', headers: auth(bearer), payload });
  const patch = (id: number, payload: Record<string, unknown>, bearer = cafe.ownerToken) =>
    app.inject({ method: 'PATCH', url: `/api/pos/products/${id}`, headers: auth(bearer), payload });
  const variants = [{ attributes: {}, price_cents: 5000, quantity: 10 }];

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('dishfacts');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    const on = await app.inject({
      method: 'PATCH',
      url: '/api/pos/store/public-menu',
      headers: auth(cafe.ownerToken),
      payload: { enabled: true },
    });
    token = on.json().token;
  }, 60000);

  const uploaded: string[] = [];

  afterAll(async () => {
    await app?.close();
    if (cafe) await dropTestStore(cafe.storeId);
    for (const f of uploaded) {
      await unlink(path.join(POS_UPLOADS_DIR, f)).catch(() => undefined);
      await unlink(path.join(POS_UPLOADS_DIR, thumbNameOf(f))).catch(() => undefined);
    }
  });

  describe('the card’s thumbnail (F10)', () => {
    it('reaches the guest for an uploaded photo and stays null for a demo picture', async () => {
      const saved = await saveImageBuffer(TINY_PNG);
      uploaded.push(saved.filename);
      const photo = (await post({ name: 'З фото', image_url: saved.url, variants })).json();
      const drawing = (await post({ name: 'З малюнком', image_url: '/demo-cafe/latte.svg', variants })).json();
      invalidatePublicMenu(cafe.storeId);
      const now = await menu();
      const withPhoto = dishOf(now, 'З фото')!;
      expect(withPhoto.image_url).toBe(saved.url);
      expect(withPhoto.thumb_url).toBe(thumbUrlOf(saved.url));
      expect(withPhoto.thumb_url).toMatch(/^\/pos-uploads\/[0-9a-f-]+\.t\.webp$/);
      expect(dishOf(now, 'З малюнком')!.thumb_url).toBeNull();
      const html = (await app.inject({ method: 'GET', url: `/m/${token}` })).body;
      expect(html).toContain(`<img src="${withPhoto.thumb_url}" width="88" height="88"`);
      await patch(photo.id, { is_active: false });
      await patch(drawing.id, { is_active: false });
    });
  });

  describe('writing them', () => {
    it('stores a composition and a canonical set of allergens, and the owner’s list carries them back', async () => {
      const res = await post({
        name: 'Латте',
        description: 'Ніжний',
        composition: '  Еспресо,\n молоко ',
        allergens: ['milk', 'gluten', 'milk'],
        variants,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ composition: 'Еспресо, молоко', allergens: ['gluten', 'milk'] });

      const list = await app.inject({ method: 'GET', url: '/api/pos/products', headers: auth(cafe.ownerToken) });
      expect(list.json().find((p: { name: string }) => p.name === 'Латте')).toMatchObject({
        composition: 'Еспресо, молоко',
        allergens: ['gluten', 'milk'],
      });
    });

    it('defaults to «not said» for a product that mentions neither', async () => {
      const res = await post({ name: 'Чай', variants });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ composition: null, allergens: [] });
    });

    it('refuses an unknown allergen and an over-long composition with a 400 the form can show, writing nothing', async () => {
      const unknown = await post({ name: 'Погана', allergens: ['milk', 'chocolate'], variants });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error).toContain('chocolate');
      const long = await post({ name: 'Довга', composition: 'а'.repeat(COMPOSITION_MAX + 1), variants });
      expect(long.statusCode).toBe(400);
      const rows = await pool.query(`SELECT 1 FROM pos_products WHERE store_id = $1 AND name IN ('Погана', 'Довга')`, [
        cafe.storeId,
      ]);
      expect(rows.rows).toHaveLength(0);
    });

    it('updates them, leaves them alone when a patch does not mention them, and clears on null and []', async () => {
      const made = (await post({ name: 'Раф', composition: 'Еспресо, вершки', allergens: ['milk'], variants })).json();

      const renamed = await patch(made.id, { name: 'Раф класичний' });
      expect(renamed.json()).toMatchObject({ composition: 'Еспресо, вершки', allergens: ['milk'] });

      const changed = await patch(made.id, { composition: 'Еспресо, вершки, цукор', allergens: ['eggs', 'milk'] });
      expect(changed.json()).toMatchObject({ composition: 'Еспресо, вершки, цукор', allergens: ['eggs', 'milk'] });

      const cleared = await patch(made.id, { composition: null, allergens: [] });
      expect(cleared.json()).toMatchObject({ composition: null, allergens: [] });

      expect((await patch(made.id, { allergens: ['nope'] })).statusCode).toBe(400);
      expect((await patch(made.id, { composition: 'а'.repeat(COMPOSITION_MAX + 1) })).statusCode).toBe(400);
    });

    it('stores a canonical set of labels, replaces it wholesale, and refuses a code it does not know with a 400 in words', async () => {
      const res = await post({ name: 'Бограч', menu_labels: ['hit', 'spicy', 'hit'], variants });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ menu_labels: ['spicy', 'hit'] });
      const list = await app.inject({ method: 'GET', url: '/api/pos/products', headers: auth(cafe.ownerToken) });
      expect(list.json().find((p: { name: string }) => p.name === 'Бограч')).toMatchObject({ menu_labels: ['spicy', 'hit'] });

      const kept = await patch(res.json().id, { name: 'Бограч по-закарпатськи' });
      expect(kept.json()).toMatchObject({ menu_labels: ['spicy', 'hit'] });
      const replaced = await patch(res.json().id, { menu_labels: ['recommended'] });
      expect(replaced.json()).toMatchObject({ menu_labels: ['recommended'] });
      const cleared = await patch(res.json().id, { menu_labels: [] });
      expect(cleared.json()).toMatchObject({ menu_labels: [] });

      const unknown = await post({ name: 'Погана позначка', menu_labels: ['spicy', 'gluten-free'], variants });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error).toContain('gluten-free');
      expect((await patch(res.json().id, { menu_labels: ['middle-spicy'] })).statusCode).toBe(400);
      const rows = await pool.query(`SELECT menu_labels FROM pos_products WHERE store_id = $1 AND name IN ('Погана позначка', 'Бограч по-закарпатськи')`, [
        cafe.storeId,
      ]);
      expect(rows.rows).toEqual([{ menu_labels: [] }]);
    });

    it('is the owner’s to write: a seller gets 403 and nothing changes', async () => {
      const made = (await post({ name: 'Капучино', composition: 'Еспресо, молоко', variants })).json();
      expect((await patch(made.id, { composition: 'Зламано' }, cafe.sellerToken)).statusCode).toBe(403);
      const row = await pool.query(`SELECT composition FROM pos_products WHERE id = $1`, [made.id]);
      expect(row.rows[0].composition).toBe('Еспресо, молоко');
    });

    it('counts an edit of either as the review the card was waiting for', async () => {
      const card = await createProduct(cafe.storeId, { name: 'З приходу', needs_review: true, variants });
      await patch(card!.id, { allergens: ['fish'] });
      const row = await pool.query(`SELECT needs_review FROM pos_products WHERE id = $1`, [card!.id]);
      expect(row.rows[0].needs_review).toBe(false);
    });
  });

  describe('the facts line’s numbers through the API (F14)', () => {
    it('stores them from the form’s text — the strength as a percent — and the owner’s list carries them back', async () => {
      const res = await post({ name: 'Сидр', kcal: '150', strength_percent: '4,5', prep_minutes: '', variants });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ kcal: 150, strength_tenths: 45, prep_minutes: null });
      const list = await app.inject({ method: 'GET', url: '/api/pos/products', headers: auth(cafe.ownerToken) });
      expect(list.json().find((p: { name: string }) => p.name === 'Сидр')).toMatchObject({ kcal: 150, strength_tenths: 45, prep_minutes: null });
      // The importer sends tenths; a number works as well as text.
      const vodka = await post({ name: 'Горілка', strength_tenths: 400, kcal: 1100, variants });
      expect(vodka.json()).toMatchObject({ kcal: 1100, strength_tenths: 400 });
    });

    it('defaults to «not said» for a product that mentions none', async () => {
      const res = await post({ name: 'Вода', variants });
      expect(res.json()).toMatchObject({ kcal: null, strength_tenths: null, prep_minutes: null });
    });

    it('refuses a bad number with a 400 in the owner’s words, writing nothing', async () => {
      const kcal = await post({ name: 'Забагато', kcal: '99999', variants });
      expect(kcal.statusCode).toBe(400);
      expect(kcal.json().error).toBe('Калорійність: ціле число від 0 до 9999');
      const strength = await post({ name: 'Заміцне', strength_percent: '101', variants });
      expect(strength.statusCode).toBe(400);
      expect(strength.json().error).toBe('Міцність: число від 0 до 100 %, не більше однієї цифри після коми');
      const minutes = await post({ name: 'Задовго', prep_minutes: 'пів години', variants });
      expect(minutes.statusCode).toBe(400);
      expect(minutes.json().error).toBe('Час приготування: ціле число хвилин від 1 до 600');
      const rows = await pool.query(`SELECT 1 FROM pos_products WHERE store_id = $1 AND name IN ('Забагато', 'Заміцне', 'Задовго')`, [
        cafe.storeId,
      ]);
      expect(rows.rows).toHaveLength(0);
    });

    it('updates them, leaves them alone when a patch does not mention them, and clears on null and an emptied box', async () => {
      const made = (await post({ name: 'Деруни', kcal: 380, prep_minutes: 15, variants })).json();
      const renamed = await patch(made.id, { name: 'Деруни зі сметаною' });
      expect(renamed.json()).toMatchObject({ kcal: 380, strength_tenths: null, prep_minutes: 15 });
      const changed = await patch(made.id, { kcal: '400', strength_percent: '0', prep_minutes: '20' });
      expect(changed.json()).toMatchObject({ kcal: 400, strength_tenths: 0, prep_minutes: 20 });
      const cleared = await patch(made.id, { kcal: null, strength_percent: '', prep_minutes: '  ' });
      expect(cleared.json()).toMatchObject({ kcal: null, strength_tenths: null, prep_minutes: null });
      expect((await patch(made.id, { kcal: -5 })).statusCode).toBe(400);
      expect((await patch(made.id, { strength_percent: '4,55' })).statusCode).toBe(400);
      expect((await patch(made.id, { prep_minutes: 0 })).statusCode).toBe(400);
      // A seller may not write them either; an edit counts as the review.
      expect((await patch(made.id, { kcal: 1 }, cafe.sellerToken)).statusCode).toBe(403);
      const card = await createProduct(cafe.storeId, { name: 'З приходу з числом', needs_review: true, variants });
      await patch(card!.id, { prep_minutes: 5 });
      const row = await pool.query(`SELECT needs_review, prep_minutes FROM pos_products WHERE id = $1`, [card!.id]);
      expect(row.rows[0]).toEqual({ needs_review: false, prep_minutes: 5 });
    });

    it('reaches the guest as three nullable numbers, drawn on the page, kept on a card nobody reviewed, and moving the fingerprint', async () => {
      const made = (await post({ name: 'Бограч ситний', kcal: 520, prep_minutes: 25, variants: [{ attributes: { size: '350 г' }, price_cents: 9000, quantity: 10 }] })).json();
      const unreviewed = await createProduct(cafe.storeId, {
        name: 'Неперевірений сидр',
        description: 'Створено з приходу ПР-14',
        strength_tenths: 45,
        needs_review: true,
        variants,
      });
      invalidatePublicMenu(cafe.storeId);
      const now = await menu();
      expect(dishOf(now, 'Бограч ситний')).toMatchObject({ kcal: 520, strength_tenths: null, prep_minutes: 25 });
      const cider = dishOf(now, 'Неперевірений сидр')!;
      expect(cider.description).toBe('');
      expect(cider).toMatchObject({ kcal: null, strength_tenths: 45, prep_minutes: null });

      const html = (await app.inject({ method: 'GET', url: `/m/${token}` })).body;
      expect(html).toContain('<p class="facts">350 г · 520 ккал · готується ≈ 25 хв</p>');
      expect(html).toContain('<p class="facts">міцність 4,5 %</p>');

      const before = now.rev;
      await patch(made.id, { kcal: 500 });
      expect((await menu()).rev).not.toBe(before);
      await patch(unreviewed!.id, { is_active: false });
    });
  });

  describe('what the guest gets', () => {
    it('carries the composition and the labels of the ticked allergens, and nothing else about them', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` });
      const latte = dishOf(res.json() as PublicMenu, 'Латте')!;
      expect(latte.composition).toBe('Еспресо, молоко');
      expect(latte.allergens).toEqual([
        { code: 'gluten', label: 'Глютен' },
        { code: 'milk', label: 'Молоко' },
      ]);
      expect(Object.keys(latte.allergens[0]!).sort()).toEqual(['code', 'label']);
      const tea = dishOf(res.json() as PublicMenu, 'Чай')!;
      expect(tea.composition).toBe('');
      expect(tea.allergens).toEqual([]);
      expect(tea.labels).toEqual([]);
    });

    it('carries the labels as code + word in canonical order, draws them on the page, and keeps them on a card nobody reviewed', async () => {
      const made = (await post({ name: 'Гострий суп', menu_labels: ['recommended', 'spicy'], variants })).json();
      const unreviewed = await createProduct(cafe.storeId, {
        name: 'Неперевірений хіт',
        description: 'Створено з приходу ПР-13',
        menu_labels: ['hit'],
        needs_review: true,
        variants,
      });
      invalidatePublicMenu(cafe.storeId);
      const now = await menu();
      expect(dishOf(now, 'Гострий суп')!.labels).toEqual([
        { code: 'spicy', label: 'Гостре' },
        { code: 'recommended', label: 'Рекомендуємо' },
      ]);
      expect(Object.keys(dishOf(now, 'Гострий суп')!.labels[0]!).sort()).toEqual(['code', 'label']);
      // The owner's ticks, not internal text: they show while the description does not.
      const hit = dishOf(now, 'Неперевірений хіт')!;
      expect(hit.description).toBe('');
      expect(hit.labels).toEqual([{ code: 'hit', label: 'Хіт' }]);

      const html = (await app.inject({ method: 'GET', url: `/m/${token}` })).body;
      expect(html).toContain('<li class="label label-spicy">');
      expect(html).toContain('<span>Рекомендуємо</span>');
      expect(html).toContain('<li class="label label-hit">');
      expect(html).not.toContain('Створено з приходу');

      // A label moves the fingerprint, so an open phone reloads with it.
      const before = now.rev;
      await patch(made.id, { menu_labels: ['spicy'] });
      expect((await menu()).rev).not.toBe(before);
      // Retire the unreviewed card without editing it (an edit would clear the
      // flag and put its internal text on the page for the tests below).
      await patch(unreviewed!.id, { is_active: false });
    });

    it('shows a change at once — the menu’s 15 s cache is dropped by the save, on create and on update', async () => {
      await menu(); // warm the cache
      const made = (await post({ name: 'Свіжа', composition: 'Перший склад', variants })).json();
      expect(dishOf(await menu(), 'Свіжа')?.composition).toBe('Перший склад');

      await patch(made.id, { composition: 'Другий склад', allergens: ['sesame'] });
      const again = dishOf(await menu(), 'Свіжа')!;
      expect(again.composition).toBe('Другий склад');
      expect(again.allergens.map((a) => a.code)).toEqual(['sesame']);
    });

    it('keeps the internal text of a card nobody reviewed off the page, and lists the dish all the same', async () => {
      const card = await createProduct(cafe.storeId, {
        name: 'Неперевірена',
        description: 'Створено з приходу ПР-12',
        composition: 'внутрішнє',
        allergens: ['milk'],
        needs_review: true,
        variants,
      });
      invalidatePublicMenu(cafe.storeId);
      const before = dishOf(await menu(), 'Неперевірена')!;
      expect(before).toBeDefined();
      expect(before.description).toBe('');
      expect(before.composition).toBe('');
      expect(before.allergens).toEqual([]);
      const html = (await app.inject({ method: 'GET', url: `/m/${token}` })).body;
      expect(html).not.toContain('Створено з приходу');

      // The owner opens the card and saves it: the review flag goes, the words appear.
      await patch(card!.id, { name: 'Перевірена', description: 'Наш опис' });
      const after = dishOf(await menu(), 'Перевірена')!;
      expect(after.description).toBe('Наш опис');
      expect(after.composition).toBe('внутрішнє');
      expect(after.allergens.map((a) => a.code)).toEqual(['milk']);
    });

    it('escapes an owner’s composition on the page, prints the note once, and matches the JSON’s fingerprint', async () => {
      const made = (await post({ name: 'Xss', composition: '<script>alert(1)</script>', allergens: ['milk'], variants })).json();
      const res = await app.inject({ method: 'GET', url: `/m/${token}` });
      expect(res.body).not.toContain('<script>alert(1)');
      expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(res.body.match(/Склад і алергени вказує заклад/g)).toHaveLength(1);
      expect(res.body.match(/<script/g)).toHaveLength(1);
      expect(res.body).toContain(`data-rev="${(await menu()).rev}"`);
      await patch(made.id, { composition: null, allergens: [] });
    });
  });

  describe('the fingerprint an open page reloads on', () => {
    it('is stable while nothing changes and moves with an allergen, a description, a name or the place’s phone', async () => {
      const made = (await post({ name: 'Ревізія', description: 'Один', allergens: ['milk'], variants })).json();
      const start = (await menu()).rev;
      expect(start).toMatch(/^[0-9a-f]{12}$/);
      invalidatePublicMenu(cafe.storeId);
      expect((await menu()).rev).toBe(start);

      const seen = new Set([start]);
      await patch(made.id, { allergens: ['milk', 'nuts'] });
      seen.add((await menu()).rev);
      await patch(made.id, { description: 'Два' });
      seen.add((await menu()).rev);
      await patch(made.id, { name: 'Ревізія 2' });
      seen.add((await menu()).rev);
      await app.inject({
        method: 'PATCH',
        url: '/api/pos/store/profile',
        headers: auth(cafe.ownerToken),
        payload: { phone: '+380 44 111 22 33' },
      });
      seen.add((await menu()).rev);
      expect(seen.size).toBe(5); // every one of them moved it
    });

    it('does NOT move when a dish is stopped: the page already patches that on its own', async () => {
      const made = (await post({ name: 'Стоп-тест', variants })).json();
      const before = (await menu()).rev;
      const res = await app.inject({
        method: 'POST',
        url: `/api/pos/kitchen/stop-list/${made.id}`,
        headers: auth(cafe.sellerToken),
        payload: { stop_listed: true },
      });
      expect(res.statusCode).toBe(200);
      const stopped = await menu();
      expect(dishOf(stopped, 'Стоп-тест')!.stopped).toBe(true);
      expect(stopped.rev).toBe(before);
    });
  });

  describe('migration 087', () => {
    it('is safe to apply again, keeps the owner’s numbers, and its CHECKs refuse what the application refuses', async () => {
      const made = (await post({ name: 'Власні числа', kcal: 300, strength_percent: '5', prep_minutes: 10, variants })).json();
      await pool.query(readMigration('087_pos_product_dish_numbers.sql'));
      await pool.query(readMigration('087_pos_product_dish_numbers.sql'));
      const row = await pool.query(`SELECT kcal, strength_tenths, prep_minutes FROM pos_products WHERE id = $1`, [made.id]);
      expect(row.rows[0]).toEqual({ kcal: 300, strength_tenths: 50, prep_minutes: 10 });
      for (const [column, value] of [['kcal', 10000], ['strength_tenths', 1001], ['prep_minutes', 0]] as const) {
        await expect(pool.query(`UPDATE pos_products SET ${column} = $2 WHERE id = $1`, [made.id, value])).rejects.toThrow(/check/);
      }
    });

    it('fills a demo dish nobody has touched — once — and never over its owner’s numbers', async () => {
      const demo = await pool.query(
        `SELECT p.id, p.kcal, p.strength_tenths, p.prep_minutes
         FROM pos_products p JOIN pos_stores s ON s.id = p.store_id
         WHERE s.slug = 'demo-restaurant' AND p.name = 'Вино червоне, келих'`
      );
      if (demo.rows.length === 0) return;
      const original = demo.rows[0];
      try {
        await pool.query(`UPDATE pos_products SET kcal = NULL, strength_tenths = NULL, prep_minutes = NULL WHERE id = $1`, [original.id]);
        await pool.query(readMigration('087_pos_product_dish_numbers.sql'));
        const filled = await pool.query(`SELECT kcal, strength_tenths, prep_minutes FROM pos_products WHERE id = $1`, [original.id]);
        expect(filled.rows[0]).toEqual({ kcal: 125, strength_tenths: 130, prep_minutes: null });
        await pool.query(`UPDATE pos_products SET kcal = 99, strength_tenths = NULL, prep_minutes = NULL WHERE id = $1`, [original.id]);
        await pool.query(readMigration('087_pos_product_dish_numbers.sql'));
        const kept = await pool.query(`SELECT kcal, strength_tenths FROM pos_products WHERE id = $1`, [original.id]);
        expect(kept.rows[0]).toEqual({ kcal: 99, strength_tenths: null });
      } finally {
        await pool.query(`UPDATE pos_products SET kcal = $2, strength_tenths = $3, prep_minutes = $4 WHERE id = $1`, [
          original.id,
          original.kcal,
          original.strength_tenths,
          original.prep_minutes,
        ]);
      }
    });
  });

  describe('migration 060', () => {
    it('is safe to apply again and leaves what an owner wrote alone', async () => {
      const made = (await post({ name: 'Власна', composition: 'Мій склад', allergens: ['eggs'], variants })).json();
      await pool.query(readMigration('060_pos_product_composition_allergens.sql'));
      await pool.query(readMigration('060_pos_product_composition_allergens.sql'));
      const row = await pool.query(`SELECT composition, allergens FROM pos_products WHERE id = $1`, [made.id]);
      expect(row.rows[0]).toEqual({ composition: 'Мій склад', allergens: ['eggs'] });
    });

    it('fills a demo dish nobody has touched — once — and never over its owner’s words', async () => {
      const demo = await pool.query(
        `SELECT p.id, p.description, p.composition, p.allergens
         FROM pos_products p JOIN pos_stores s ON s.id = p.store_id
         WHERE s.slug = 'demo-cafe' AND p.name = 'Латте'`
      );
      if (demo.rows.length === 0) return;
      const original = demo.rows[0];
      const id = original.id;
      try {
        await pool.query(`UPDATE pos_products SET composition = NULL, allergens = '{}', description = NULL WHERE id = $1`, [id]);
        await pool.query(readMigration('060_pos_product_composition_allergens.sql'));
        const filled = await pool.query(`SELECT composition, allergens, description FROM pos_products WHERE id = $1`, [id]);
        expect(filled.rows[0].composition).toBe('Еспресо, молоко');
        expect(filled.rows[0].allergens).toEqual(['milk']);
        expect(filled.rows[0].description).toBeTruthy();

        await pool.query(`UPDATE pos_products SET composition = 'Власний склад', allergens = '{eggs}', description = 'Мій опис' WHERE id = $1`, [id]);
        await pool.query(readMigration('060_pos_product_composition_allergens.sql'));
        const kept = await pool.query(`SELECT composition, allergens, description FROM pos_products WHERE id = $1`, [id]);
        expect(kept.rows[0]).toEqual({ composition: 'Власний склад', allergens: ['eggs'], description: 'Мій опис' });
      } finally {
        await pool.query(`UPDATE pos_products SET composition = $2, allergens = $3::text[], description = $4 WHERE id = $1`, [
          id,
          original.composition,
          original.allergens,
          original.description,
        ]);
      }
    });
  });
});
