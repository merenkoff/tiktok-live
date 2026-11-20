// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cabinet's quick search: type «латте» in the sidebar and land on the
// dish — or on its tech card — instead of opening «Товари» and searching
// there. Pure: the component only draws what this finds.

import type { Product } from '../types';

export interface SearchPage {
  label: string;
  to: string;
}

export interface SearchHit {
  key: string;
  kind: 'page' | 'product';
  title: string;
  /** «інгредієнт», «є рецепт» — what the thing is, quietly. */
  hint?: string;
  to: string;
  /** A dish with a recipe also opens straight on its tech card. */
  recipeTo?: string;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/[ʼ'`’]/g, '').trim();
}

/** Every typed word must be found; a name that STARTS with the query comes first. */
function score(name: string, words: string[]): number {
  const hay = fold(name);
  if (!words.every((word) => hay.includes(word))) return -1;
  if (hay.startsWith(words[0])) return 2;
  return hay.split(/\s+/).some((part) => part.startsWith(words[0])) ? 1 : 0;
}

/**
 * Pages by their menu label first, then products by name — best match first,
 * then by the alphabet. `recipes` says whether this person may open the tech
 * cards at all (the marketer may not).
 */
export function searchSidebar(
  query: string,
  pages: readonly SearchPage[],
  products: readonly Product[],
  opts: { limit?: number; recipes?: boolean } = {}
): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const limit = opts.limit ?? 8;

  const pageHits: SearchHit[] = pages
    .map((page) => ({ page, rank: score(page.label, words) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map(({ page }) => ({ key: `page:${page.to}`, kind: 'page' as const, title: page.label, hint: 'розділ', to: page.to }));

  const productHits: SearchHit[] = products
    .filter((p) => p.is_active)
    .map((product) => ({ product, rank: score(product.name, words) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => b.rank - a.rank || a.product.name.localeCompare(b.product.name, 'uk'))
    .slice(0, Math.max(0, limit - pageHits.length))
    .map(({ product }) => {
      const recipe = product.kind === 'composite';
      return {
        key: `product:${product.id}`,
        kind: 'product' as const,
        title: product.name,
        hint: product.sellable === false ? (recipe ? 'заготовка' : 'інгредієнт') : recipe ? 'є рецепт' : undefined,
        to: `/admin/products/${product.id}`,
        ...(recipe && opts.recipes ? { recipeTo: `/admin/tech-cards?open=${product.id}` } : {}),
      };
    });

  return [...pageHits, ...productHits];
}

/** How long a fetched catalogue is good for before the next focus asks again. */
const FRESH_MS = 60_000;
let kept: { at: number; products: Product[] } | null = null;

/** The catalogue the search last read, and whether it is still fresh enough not to ask again. */
export function freshCatalogue(now = Date.now()): { products: Product[]; fresh: boolean } | null {
  return kept ? { products: kept.products, fresh: now - kept.at < FRESH_MS } : null;
}

export function keepCatalogue(products: Product[], now = Date.now()): void {
  kept = { at: now, products };
}

/** For tests: forget the catalogue between cases. */
export function forgetCatalogue(): void {
  kept = null;
}
