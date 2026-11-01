// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A synthetic ChoiceQR menu page in the shape the real one has (Next.js
// `__NEXT_DATA__` → `props.app`): a made-up café, so no client's menu ever
// lives in the repository (TechDocs/POS_ONBOARDING.md, O2).

export const MEDIA = 'https://cdn-media.choiceqr.com/prod-eat-test/menu';

export interface FakeItem {
  id: string;
  category: string;
  name: string;
  price: number;
  weight?: string;
  weightType?: string;
  description?: string;
  photo?: string | null;
  available?: boolean;
  /** ChoiceQR's `menu_labels`: a fixed `type`, or `custom: true` with its own `name`. */
  labels?: Array<{ type?: string; custom?: boolean; name?: string }>;
  /** ChoiceQR's `kcal`, `alcohol` (percent) and `preparationTime` (minutes): integers, 0 = not said (F14). */
  kcal?: number;
  alcohol?: number;
  preparationTime?: number;
}

export const FAKE_CATEGORIES = [
  { _id: 'c-soup', name: 'Перші страви' },
  { _id: 'c-drinks', name: 'Холодні напої' },
  { _id: 'c-vodka', name: 'Горілка' },
  { _id: 'c-side', name: 'Гарнір' },
  { _id: 'c-empty', name: 'Порожня' },
];

export const FAKE_ITEMS: FakeItem[] = [
  // Both spiciness grades fold into one «Гостре»; the custom label is reported, not carried.
  { id: 'i1', category: 'c-soup', name: 'Борщ', price: 15500, weight: '300', weightType: 'g', description: 'з пампушкою', photo: `${MEDIA}/borshch.jpeg`, labels: [{ type: 'spicy', custom: false }, { type: 'middle-spicy', custom: false }, { type: 'custom', custom: true, name: 'Хіт сезону' }], kcal: 320, preparationTime: 15 },
  { id: 'i2', category: 'c-soup', name: 'Бульйон', price: 12000, weight: '300', weightType: 'g', photo: null },
  { id: 'i3', category: 'c-drinks', name: 'Взвар', price: 11000, weight: '1', weightType: 'l', photo: `${MEDIA}/vzvar.jpeg` },
  { id: 'i4', category: 'c-drinks', name: 'Взвар ', price: 4000, weight: '300', weightType: 'ml' },
  { id: 'i5', category: 'c-drinks', name: 'Лимонад', price: 8500, weight: '300', weightType: 'ml', available: false },
  // «Не містить глютену» is a claim the till never makes; the card takes the labels of BOTH sizes.
  // The strength is the drink's: the card takes the first size's (both say 40 here); kcal only the big bottle says.
  { id: 'i6', category: 'c-vodka', name: 'Гетьман', price: 5000, weight: '50', weightType: 'ml', photo: 'https://evil.example.com/x.jpeg', labels: [{ type: 'gluten', custom: false }, { type: 'recommended', custom: false }], alcohol: 40 },
  { id: 'i7', category: 'c-vodka', name: 'Гетьман', price: 35000, weight: '500', weightType: 'ml', labels: [{ type: 'vegan', custom: false }], alcohol: 40, kcal: 1100 },
  { id: 'i8', category: 'c-side', name: 'Печена картопля', price: 11500, weight: '300', weightType: 'g' },
  { id: 'i9', category: 'c-side', name: 'Печена картопля', price: 15500, weight: '300', weightType: 'g' },
  { id: 'i10', category: 'c-side', name: 'Печена картопля', price: 11500, weight: '300', weightType: 'g' },
  { id: 'i11', category: 'c-side', name: 'Хліб', price: 0, weight: '', weightType: 'g' },
  { id: 'i12', category: 'c-drinks', name: 'Кола', price: 6000, weight: '0,33', weightType: 'ml' },
];

export function choiceQrPage(items: FakeItem[] = FAKE_ITEMS): string {
  const data = {
    props: {
      pageProps: {},
      app: {
        place: {
          name: 'Тестова корчма',
          contactInfo: { phone: '+380 67 123 45 67', address: { prediction: 'м. Тест, вул. Вигадана, 1' } },
          companyImages: { logo: `${MEDIA}/../logo/thumbnail_logo.jpeg` },
          // JS weekdays: 0 is Sunday. Saturday off.
          workTimeAll: [
            { dayOfWeek: 0, active: true, from: '12:00:00.000', till: '20:00:00.000' },
            { dayOfWeek: 1, active: true, from: '11:00:00.000', till: '22:00:00.000' },
            { dayOfWeek: 2, active: true, from: '11:00:00.000', till: '22:00:00.000' },
            { dayOfWeek: 3, active: true, from: '11:00:00.000', till: '22:00:00.000' },
            { dayOfWeek: 4, active: true, from: '11:00:00.000', till: '22:00:00.000' },
            { dayOfWeek: 5, active: true, from: '11:00:00.000', till: '23:30:00.000' },
            { dayOfWeek: 6, active: false, from: '11:00:00.000', till: '22:00:00.000' },
          ],
        },
        categories: FAKE_CATEGORIES,
        menu: items.map((i) => ({
          _id: i.id,
          category: i.category,
          name: i.name,
          price: i.price,
          weight: i.weight ?? '',
          weightType: i.weightType ?? 'g',
          description: i.description ?? '',
          media: i.photo ? [{ url: i.photo, medium: i.photo, big: i.photo }] : [],
          available: i.available !== false,
          menu_labels: (i.labels ?? []).map((l, n) => ({ _id: `${i.id}-l${n}`, ...l })),
          // As on the real page: present on every dish, 0 where nothing was said.
          kcal: i.kcal ?? 0,
          alcohol: i.alcohol ?? 0,
          preparationTime: i.preparationTime ?? 0,
          externalMedia: [],
        })),
      },
    },
  };
  return `<!DOCTYPE html><html><head><title>Меню</title></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">${JSON.stringify(data)}</script></body></html>`;
}

/** The smallest valid PNG (1×1), what the fake media host answers with. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
