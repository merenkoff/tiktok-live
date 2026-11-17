// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { forgetCatalogue, freshCatalogue, keepCatalogue, searchSidebar } from './sidebarSearch';

function product(id: number, name: string, patch: Partial<Product> = {}): Product {
  return { id, name, description: null, image_url: null, is_active: true, sellable: true, tag_ids: [], variants: [], ...patch } as Product;
}

const PAGES = [
  { label: 'Товари', to: '/admin/products' },
  { label: 'Техкарти', to: '/admin/tech-cards' },
  { label: 'Склад', to: '/admin/stock' },
];
const PRODUCTS = [
  product(1, 'Латте', { kind: 'composite', stock_mode: 'derived' }),
  product(2, 'Айс-латте'),
  product(3, 'Молоко вівсяне', { sellable: false }),
  product(4, 'Соус демі-глас', { sellable: false, kind: 'composite' }),
  product(5, 'Латте старий', { is_active: false }),
  product(6, 'Склянка'),
];

afterEach(() => forgetCatalogue());

describe('searchSidebar', () => {
  it('finds a dish by name — a name that starts with the query first — and offers its tech card', () => {
    const hits = searchSidebar('лат', PAGES, PRODUCTS, { recipes: true });
    expect(hits.map((h) => h.title)).toEqual(['Латте', 'Айс-латте']);
    expect(hits[0]).toMatchObject({ to: '/admin/products/1', hint: 'є рецепт', recipeTo: '/admin/tech-cards?open=1' });
    expect(hits[1].recipeTo).toBeUndefined();
  });

  it('says what a thing is: an ingredient, a prep', () => {
    expect(searchSidebar('молоко', PAGES, PRODUCTS)[0].hint).toBe('інгредієнт');
    expect(searchSidebar('демі', PAGES, PRODUCTS)[0].hint).toBe('заготовка');
  });

  it('finds a section by its menu label, before the products', () => {
    const hits = searchSidebar('скл', PAGES, PRODUCTS);
    expect(hits.map((h) => [h.kind, h.title])).toEqual([
      ['page', 'Склад'],
      ['product', 'Склянка'],
    ]);
  });

  it('needs every word, ignores archived cards, and offers no tech card to someone who may not open them', () => {
    expect(searchSidebar('латте айс', PAGES, PRODUCTS).map((h) => h.title)).toEqual(['Айс-латте']);
    expect(searchSidebar('старий', PAGES, PRODUCTS)).toEqual([]);
    expect(searchSidebar('латте', PAGES, PRODUCTS, { recipes: false })[0].recipeTo).toBeUndefined();
    expect(searchSidebar('  ', PAGES, PRODUCTS)).toEqual([]);
  });

  it('keeps the catalogue a minute', () => {
    expect(freshCatalogue()).toBeNull();
    keepCatalogue(PRODUCTS, 1_000);
    expect(freshCatalogue(30_000)?.fresh).toBe(true);
    expect(freshCatalogue(62_000)).toMatchObject({ fresh: false });
    expect(freshCatalogue(62_000)?.products).toHaveLength(PRODUCTS.length);
  });
});
