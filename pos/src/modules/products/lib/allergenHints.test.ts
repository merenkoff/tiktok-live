// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Product } from '../../../types';
import { allergenHints, allergensInName } from './allergenHints';

type Line = { component_variant_id: number; product_name: string; label?: string };

function card(id: number, name: string, extra: Partial<Product> = {}, lines: Line[] = []): Product {
  return {
    id,
    name,
    is_active: true,
    tag_ids: [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: {},
        label: '',
        unit: 'шт',
        price_cents: 0,
        is_active: true,
        components: lines.map((l, i) => ({ id: i + 1, quantity: 10, sort_order: i, label: '', ...l })),
      },
    ],
    ...extra,
  } as unknown as Product;
}

const line = (product: Product): Line => ({ component_variant_id: product.variants[0]!.id, product_name: product.name });

describe('allergensInName: a guess from the words of a name', () => {
  it.each([
    ['Вершки 33 %', ['milk']],
    ['Масло вершкове', ['milk']],
    ['Масло оливкове', []],
    ['Сироп карамельний', []],
    ['Сир твердий', ['milk']],
    ['Борошно пшеничне', ['gluten']],
    ['Яйце куряче', ['eggs']],
    ['Соус соєвий', ['soy']],
    ['Креветки тигрові', ['crustaceans']],
    ['Лосось слабосолений', ['fish']],
    ['Кеш’ю', ['nuts']],
    ['Вино біле сухе', ['sulphites']],
    ['Виноград', []],
    ['Майонез', ['eggs']],
    ['Сирники', ['milk']],
  ])('%s → %j', (name, codes) => {
    expect(allergensInName(name)).toEqual(codes);
  });
});

describe('allergenHints: what the recipe suggests', () => {
  const cream = card(1, 'Вершки 33 %');
  const flour = card(2, 'Борошно');
  const sauce = card(3, 'Маринад фірмовий', { allergens: ['soy'] });
  const salt = card(4, 'Сіль');
  const demiGlace = card(5, 'Соус демі-глас, порція', {}, [line(cream), line(salt)]);

  it('guesses by name and names the ingredient that suggests it', () => {
    const dish = card(9, 'Деруни', {}, [line(flour), line(cream), line(salt)]);
    expect(allergenHints(dish, [flour, cream, salt, dish])).toEqual([
      { code: 'gluten', label: 'Глютен', from: ['борошно'], fromCard: false },
      { code: 'milk', label: 'Молоко', from: ['вершки 33 %'], fromCard: false },
    ]);
  });

  it('takes what the ingredient’s own card says, which no name gives away', () => {
    const dish = card(9, 'Курка гриль', {}, [line(sauce), line(salt)]);
    expect(allergenHints(dish, [sauce, salt, dish])).toEqual([
      { code: 'soy', label: 'Соя', from: ['маринад фірмовий'], fromCard: true },
    ]);
  });

  it('walks into a prep and names the prep, not its insides', () => {
    const steak = card(9, 'Стейк', {}, [line(demiGlace)]);
    expect(allergenHints(steak, [cream, salt, demiGlace, steak])).toEqual([
      { code: 'milk', label: 'Молоко', from: ['соус демі-глас'], fromCard: false },
    ]);
  });

  it('says nothing when there is nothing to say — never «no allergens»', () => {
    const tea = card(9, 'Чай', {}, [line(salt)]);
    expect(allergenHints(tea, [salt, tea])).toEqual([]);
    expect(allergenHints(card(10, 'Без рецепта'), [])).toEqual([]);
    expect(allergenHints(null, [])).toEqual([]);
  });

  it('survives a line that names nothing and a recipe that loops', () => {
    const a = card(20, 'Заготовка А');
    const b = card(21, 'Заготовка Б', {}, [line(a)]);
    a.variants[0]!.components = [{ id: 1, component_variant_id: b.variants[0]!.id, quantity: 1, sort_order: 0, product_name: 'Заготовка Б', label: '' }] as never;
    const dish = card(9, 'Страва', {}, [line(a), { component_variant_id: 999, product_name: undefined as never }]);
    expect(allergenHints(dish, [a, b, dish])).toEqual([]);
  });
});
