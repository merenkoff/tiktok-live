// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/import.choiceqr.test.ts — the pure half of «Імпорт з ChoiceQR»
// (TechDocs/POS_ONBOARDING.md, O2): what is read off the page and how it
// becomes cards, variants and tags. No database, no network.

import { describe, expect, it } from 'vitest';
import { menuUrl, MenuImportError, parseChoiceQr, planMenuImport, productKey, stationOf } from '../pos/import/choiceqr.js';
import { sniffImageMime } from '../pos/uploads.service.js';
import { choiceQrPage, TINY_PNG } from './helpers/choiceqr-page.js';

const none = { tags: new Set<string>(), products: new Set<string>() };

describe('menuUrl', () => {
  it('takes a ChoiceQR menu address and nothing else', () => {
    expect(menuUrl(' https://shablya.choiceqr.com/menu#top ').toString()).toBe('https://shablya.choiceqr.com/menu');
    for (const bad of [
      'http://shablya.choiceqr.com/menu',
      'https://choiceqr.com.evil.example/menu',
      'https://evil.example/shablya.choiceqr.com',
      'https://user:pw@shablya.choiceqr.com/menu',
      'https://shablya.choiceqr.com:8443/menu',
      'https://127.0.0.1/menu',
      'не посилання',
    ]) {
      expect(() => menuUrl(bad), bad).toThrow(MenuImportError);
    }
  });
});

describe('parseChoiceQr', () => {
  const menu = parseChoiceQr(choiceQrPage());

  it('reads the place: address, phone, logo and the week in ISO days', () => {
    expect(menu.place).toMatchObject({
      name: 'Тестова корчма',
      address: 'м. Тест, вул. Вигадана, 1',
      phone: '+380 67 123 45 67',
    });
    expect(menu.place.logoUrl).toMatch(/logo\/thumbnail_logo\.jpeg$/);
    // JS Sunday (0) is our "7"; an inactive Saturday is simply absent.
    expect(menu.place.hours).toEqual({
      '1': { open: '11:00', close: '22:00' },
      '2': { open: '11:00', close: '22:00' },
      '3': { open: '11:00', close: '22:00' },
      '4': { open: '11:00', close: '22:00' },
      '5': { open: '11:00', close: '23:30' },
      '7': { open: '12:00', close: '20:00' },
    });
  });

  it('reads each dish with its size in words, price in kopecks and the photo', () => {
    const borshch = menu.items.find((i) => i.id === 'i1');
    expect(borshch).toEqual({
      id: 'i1',
      categoryId: 'c-soup',
      name: 'Борщ',
      description: 'з пампушкою',
      priceCents: 15500,
      size: '300 г',
      photoUrl: 'https://cdn-media.choiceqr.com/prod-eat-test/menu/borshch.jpeg',
      available: true,
      labels: ['spicy'],
      labelsSkipped: ['«Хіт сезону»'],
      kcal: 320,
      strengthTenths: null,
      prepMinutes: 15,
    });
    expect(menu.items.find((i) => i.id === 'i3')?.size).toBe('1 л');
    expect(menu.items.find((i) => i.id === 'i11')?.size).toBeNull();
  });

  it('reads the calories, the strength as tenths of a percent and the minutes — and ChoiceQR’s 0 as «not said» (F14)', () => {
    const by = (id: string) => menu.items.find((i) => i.id === id)!;
    expect(by('i6')).toMatchObject({ kcal: null, strengthTenths: 400, prepMinutes: null });
    expect(by('i7')).toMatchObject({ kcal: 1100, strengthTenths: 400, prepMinutes: null });
    expect(by('i2')).toMatchObject({ kcal: null, strengthTenths: null, prepMinutes: null });
    const odd = parseChoiceQr(
      choiceQrPage([
        { id: 'x', category: 'c-soup', name: 'Дивна', price: 100, kcal: 20000, alcohol: 4.5, preparationTime: -3 },
        { id: 'y', category: 'c-soup', name: 'Дивніша', price: 100, kcal: 450.5, alcohol: 101, preparationTime: 900 },
      ])
    ).items;
    // A fraction of a percent is kept; a figure outside our range is «not said» rather than refused.
    expect(odd[0]).toMatchObject({ kcal: null, strengthTenths: 45, prepMinutes: null });
    expect(odd[1]).toMatchObject({ kcal: null, strengthTenths: null, prepMinutes: null });
  });

  it('reads the labels as our codes — both spiciness grades as «Гостре» — and names what it does not carry', () => {
    const by = (id: string) => menu.items.find((i) => i.id === id)!;
    expect(by('i6')).toMatchObject({ labels: ['recommended'], labelsSkipped: ['«Не містить глютену»'] });
    expect(by('i7')).toMatchObject({ labels: ['vegan'], labelsSkipped: [] });
    expect(by('i2')).toMatchObject({ labels: [], labelsSkipped: [] });
    // Junk in the list is ignored, an unknown fixed type is named, a nameless custom one too.
    const odd = parseChoiceQr(
      choiceQrPage([
        { id: 'x', category: 'c-soup', name: 'Дивна', price: 100, labels: [{ type: 'halal', custom: false }, { custom: true }, { type: 'new', custom: false }] },
      ])
    ).items[0]!;
    expect(odd.labels).toEqual(['new']);
    expect(odd.labelsSkipped).toEqual(['«halal»', 'своя позначка']);
  });

  it('refuses a page without a ChoiceQR menu', () => {
    expect(() => parseChoiceQr('<html><body>hi</body></html>')).toThrow(/немає меню ChoiceQR/);
    expect(() => parseChoiceQr('<script id="__NEXT_DATA__" type="application/json">{oops</script>')).toThrow(/не прочиталося/);
  });
});

describe('planMenuImport', () => {
  const plan = planMenuImport(parseChoiceQr(choiceQrPage()), none);
  const card = (name: string) => plan.products.find((p) => p.name === name);

  it('makes one card per name, the other sizes its variants', () => {
    expect(card('Взвар')?.variants).toEqual([
      { size: '1 л', price_cents: 11000 },
      { size: '300 мл', price_cents: 4000 },
    ]);
    expect(card('Гетьман')?.variants.map((v) => v.size)).toEqual(['50 мл', '500 мл']);
  });

  it('skips a true duplicate and splits two dishes that share a name and a size', () => {
    expect(card('Печена картопля')?.variants).toEqual([{ size: '300 г', price_cents: 11500 }]);
    expect(card('Печена картопля (2)')?.variants).toEqual([{ size: '300 г', price_cents: 15500 }]);
    expect(plan.warnings.join('\n')).toMatch(/«Печена картопля» 300 г у «Гарнір» двічі з різною ціною .* друга стане «Печена картопля \(2\)»/);
    expect(plan.warnings.join('\n')).toMatch(/«Печена картопля» 300 г у «Гарнір» двічі з тією ж ціною — друга пропущена/);
  });

  it('gives a card the first size’s numbers (a portion’s), and nothing where every size says nothing', () => {
    expect(card('Борщ')).toMatchObject({ kcal: 320, strengthTenths: null, prepMinutes: 15 });
    // The 50 мл says the strength and no calories; the 500 мл says both: the card takes each from the first that says it.
    expect(card('Гетьман')).toMatchObject({ kcal: 1100, strengthTenths: 400, prepMinutes: null });
    expect(card('Бульйон')).toMatchObject({ kcal: null, strengthTenths: null, prepMinutes: null });
  });

  it('gives a card the labels of every size, and warns once about the labels it leaves behind', () => {
    expect(card('Борщ')?.labels).toEqual(['spicy']);
    expect(card('Гетьман')?.labels).toEqual(['vegan', 'recommended']);
    expect(card('Бульйон')?.labels).toEqual([]);
    const about = plan.warnings.filter((w) => w.startsWith('Позначки, яких у касі немає'));
    expect(about).toHaveLength(1);
    expect(about[0]).toBe(
      'Позначки, яких у касі немає, не перенесено (своє слово допишіть в опис страви): Борщ 300 г: «Хіт сезону»; Гетьман 50 мл: «Не містить глютену».'
    );
  });

  it('names what the guest could not order there and what costs nothing', () => {
    expect(plan.warnings.join('\n')).toMatch(/Недоступні на ChoiceQR, імпортуються як звичайні: Лимонад/);
    expect(plan.warnings.join('\n')).toMatch(/Ціна 0 ₴: Хліб/);
    expect(plan.warnings.join('\n')).toMatch(/Схоже на описку в одиниці: Кола 0,33 мл/);
    expect(card('Кола')?.variants).toEqual([{ size: '0,33 мл', price_cents: 6000 }]);
  });

  it('turns categories into tags with a station guessed from the name, skipping empty ones', () => {
    expect(plan.tags.map((t) => [t.name, t.station, t.products])).toEqual([
      ['Перші страви', 'kitchen', 2],
      ['Холодні напої', 'bar', 3],
      ['Горілка', 'bar', 1],
      ['Гарнір', 'kitchen', 3],
    ]);
    expect(plan.totals).toEqual({ tags_new: 4, products_new: 9, products_existing: 0, variants_new: 11, photos: 3 });
  });

  it('leaves alone what the store already has, which is what makes a re-run harmless', () => {
    const again = planMenuImport(parseChoiceQr(choiceQrPage()), {
      tags: new Set(['перші страви']),
      products: new Set([productKey('Перші страви', 'Борщ')]),
    });
    expect(again.tags[0]).toMatchObject({ name: 'Перші страви', exists: true });
    expect(again.products.find((p) => p.name === 'Борщ')?.exists).toBe(true);
    expect(again.totals).toMatchObject({ tags_new: 3, products_new: 8, products_existing: 1 });
  });
});

describe('stationOf', () => {
  it.each([
    ['Кава', 'bar'],
    ['Натуральні чаї', 'bar'],
    ['Соки в асортименті', 'bar'],
    ['Ром', 'bar'],
    ['Наливки', 'bar'],
    ['Пиво', 'bar'],
    ['Соуси', 'kitchen'],
    ['Солоні вареники', 'kitchen'],
    ['Українське асорті', 'kitchen'],
    ['Основні страви', 'kitchen'],
  ])('%s → %s', (name, station) => expect(stationOf(name)).toBe(station));
});

describe('sniffImageMime', () => {
  it('reads the type from the bytes, not from a name', () => {
    expect(sniffImageMime(TINY_PNG)).toBe('image/png');
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.from('RIFF0000WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});
