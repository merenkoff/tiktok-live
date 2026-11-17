// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { ModifierGroup, Product } from '@pos/platform';
import {
  DISH,
  PRODUCT,
  answersPreview,
  countText,
  deltaText,
  groupMatches,
  groupProblems,
  namesPreview,
  productsAsking,
  queryWords,
  ruleSentence,
  ruleText,
  suggestGroups,
  usageText,
} from './modifierWords';

function group(id: number, name: string, answers: Array<[string, number, boolean?]>, patch: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id,
    name,
    min_select: 0,
    max_select: 1,
    sort_order: 0,
    is_active: true,
    product_ids: [],
    modifiers: answers.map(([answerName, cents, active = true], index) => ({
      id: id * 10 + index,
      group_id: id,
      name: answerName,
      price_delta_cents: cents,
      component_variant_id: null,
      component_quantity: null,
      component: null,
      is_default: false,
      sort_order: index,
      is_active: active,
    })),
    ...patch,
  };
}

function product(id: number, name: string, tagIds: number[], groupIds: number[], patch: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: tagIds,
    modifier_group_ids: groupIds,
    variants: [],
    ...patch,
  } as Product;
}

describe('modifierWords: how a modifier is said', () => {
  it('writes a price delta the short way', () => {
    expect([1500, -2000, 1250, 0, 100000].map(deltaText)).toEqual(['+15 ₴', '−20 ₴', '+12,50 ₴', '', '+1000 ₴']);
  });

  it('says the rule in the cashier’s terms', () => {
    expect(ruleText({ min_select: 1, max_select: 1 })).toBe('обовʼязково · одна відповідь');
    expect(ruleText({ min_select: 0, max_select: 1 })).toBe('за бажанням · одна відповідь');
    expect(ruleText({ min_select: 0, max_select: 3 })).toBe('за бажанням · до 3');
    expect(ruleText({ min_select: 2, max_select: 2 })).toBe('обовʼязково · рівно 2');
    expect(ruleText({ min_select: 1, max_select: 3 })).toBe('обовʼязково · від 1 до 3');
    expect(ruleSentence({ min_select: 1, max_select: 1 })).toMatch(/не пробʼє/);
    expect(ruleSentence({ min_select: 0, max_select: 3 })).toMatch(/до 3 відповідей або жодної/);
  });

  it('previews only what the till shows, and counts the rest', () => {
    const milk = group(1, 'Молоко', [['звичайне', 0], ['вівсяне', 1500], ['старе', 500, false], ['кокосове', 2000], ['соєве', 1000], ['мигдальне', 2500]]);
    expect(answersPreview(milk, 3)).toBe('звичайне · вівсяне +15 ₴ · кокосове +20 ₴ · ще 2');
    expect(answersPreview(group(2, 'Порожнє', []))).toBe('');
  });

  it('counts in Ukrainian', () => {
    expect([1, 2, 5, 11, 21, 22, 112].map((n) => countText(n, DISH))).toEqual([
      '1 страва', '2 страви', '5 страв', '11 страв', '21 страва', '22 страви', '112 страв',
    ]);
    expect(usageText(1, DISH)).toBe('в 1 страві');
    expect(usageText(12, DISH)).toBe('у 12 стравах');
    expect(usageText(3, PRODUCT)).toBe('у 3 товарах');
    expect(namesPreview(['Латте', 'Раф'])).toBe('Латте, Раф');
    expect(namesPreview(['Латте', 'Раф', 'Капучино', 'Флет', 'Мокко'], 3)).toBe('Латте, Раф, Капучино і ще 2');
  });

  it('names what is wrong with a question', () => {
    expect(groupProblems(group(1, 'Молоко', [['звичайне', 0]], { product_ids: [5] }))).toEqual([]);
    expect(groupProblems(group(1, 'Молоко', [['звичайне', 0]]))).toEqual(['unused']);
    expect(groupProblems(group(1, 'Молоко', [['старе', 0, false]], { product_ids: [5] }))).toEqual(['no_answers']);
    expect(groupProblems(group(1, 'Молоко', [], { is_active: false }))).toEqual(['off', 'no_answers', 'unused']);
  });

  it('finds a question by its name or by any answer', () => {
    const milk = group(1, 'Молоко', [['звичайне', 0], ['Вівсяне', 1500]]);
    expect(groupMatches(milk, queryWords('мол'))).toBe(true);
    expect(groupMatches(milk, queryWords('вівс'))).toBe(true);
    expect(groupMatches(milk, queryWords('молоко вівсяне'))).toBe(true);
    expect(groupMatches(milk, queryWords('сироп'))).toBe(false);
    expect(groupMatches(milk, queryWords('  '))).toBe(true);
  });

  it('suggests what the product’s neighbours under the same tags ask, most asked first', () => {
    const milk = group(1, 'Молоко', [['звичайне', 0]]);
    const syrup = group(2, 'Сироп', [['ваніль', 1000]]);
    const doneness = group(3, 'Просмаження', [['medium', 0]]);
    const off = group(4, 'Старе', [['x', 0]], { is_active: false });
    const groups = [milk, syrup, doneness, off];
    const COFFEE = 7;
    const GRILL = 8;
    const products = [
      product(1, 'Латте', [COFFEE], [1, 2, 4]),
      product(2, 'Капучино', [COFFEE], [1]),
      product(3, 'Раф', [COFFEE], [1, 2]),
      product(4, 'Стейк', [GRILL], [3]),
      product(5, 'Архівна кава', [COFFEE], [3], { is_active: false }),
    ];
    const forFlat = suggestGroups(groups, products, [COFFEE], { productId: 99 });
    expect(forFlat.map((s) => [s.group.name, s.asking, s.outOf])).toEqual([
      ['Молоко', 3, 3],
      ['Сироп', 2, 3],
    ]);
    // What the card already asks is not offered again; the card is not its own neighbour.
    expect(suggestGroups(groups, products, [COFFEE], { productId: 1, exclude: [1] }).map((s) => s.group.name)).toEqual(['Сироп']);
    // No tags, no neighbours.
    expect(suggestGroups(groups, products, [])).toEqual([]);
  });

  it('lists who asks a question, by name', () => {
    const milk = group(1, 'Молоко', [['звичайне', 0]], { product_ids: [3, 1] });
    const products = [product(1, 'Раф', [], [1]), product(2, 'Чай', [], []), product(3, 'Латте', [], [1])];
    expect(productsAsking(milk, products).map((p) => p.name)).toEqual(['Латте', 'Раф']);
  });
});
