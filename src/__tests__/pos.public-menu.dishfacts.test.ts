// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.dishfacts.test.ts — what a dish says about what
// is in it: the owner's line of composition and the allergens they ticked
// (migration 060, TechDocs/POS_QR_MENU.md phase Q3b). The first half is pure;
// the second drives the real POS plugin.

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
    image_url: null,
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

  afterAll(async () => {
    await app?.close();
    if (cafe) await dropTestStore(cafe.storeId);
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
