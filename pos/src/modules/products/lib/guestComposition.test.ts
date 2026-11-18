// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { Product } from '@pos/platform';
import { appendAll, appendWord, guestWord, mentions, recipeWords } from './guestComposition';

const line = (product_name: string, label = '') => ({
  id: 1,
  component_variant_id: 1,
  quantity: 0,
  sort_order: 0,
  product_name,
  label,
  unit: 'г',
});

describe('«Склад для гостя» from the recipe’s words', () => {
  it('names an ingredient the way a guest reads it', () => {
    expect(guestWord({ product_name: 'Рібай' })).toBe('рібай');
    expect(guestWord({ product_name: 'Соус демі-глас, порція' })).toBe('соус демі-глас');
    expect(guestWord({ product_name: 'Молоко', label: 'вівсяне' })).toBe('молоко вівсяне');
    // An abbreviation keeps its capitals.
    expect(guestWord({ product_name: 'BBQ соус' })).toBe('BBQ соус');
  });

  it('lists each word once, across every size, and skips an archived size', () => {
    const product = {
      variants: [
        { is_active: true, components: [line('Еспресо'), line('Молоко')] },
        { is_active: true, components: [line('Еспресо'), line('Сироп карамельний')] },
        { is_active: false, components: [line('Вершки')] },
      ],
    } as unknown as Product;
    expect(recipeWords(product)).toEqual(['еспресо', 'молоко', 'сироп карамельний']);
    expect(recipeWords(null)).toEqual([]);
  });

  it('adds a word the way a list is written, and «all» only what is not there yet', () => {
    expect(appendWord('', 'рібай')).toBe('Рібай');
    expect(appendWord('Рібай', 'масло вершкове')).toBe('Рібай, масло вершкове');
    expect(appendWord('Рібай, ', 'сіль')).toBe('Рібай, сіль');
    expect(mentions('Рібай, Масло вершкове', 'масло вершкове')).toBe(true);
    expect(appendAll('Рібай', ['рібай', 'масло вершкове', 'соус демі-глас'])).toBe(
      'Рібай, масло вершкове, соус демі-глас'
    );
  });
});
