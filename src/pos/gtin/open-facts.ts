// src/pos/gtin/open-facts.ts — shared mapper for Open Products/Food/Beauty Facts

import type { GtinLookupResult, GtinSource } from './types.js';

export type OpenFactsKind = 'products' | 'food' | 'beauty';

const HOSTS: Record<OpenFactsKind, { source: GtinSource; base: string }> = {
  products: {
    source: 'open_products_facts',
    base: 'https://world.openproductsfacts.org',
  },
  food: {
    source: 'open_food_facts',
    base: 'https://world.openfoodfacts.org',
  },
  beauty: {
    source: 'open_beauty_facts',
    base: 'https://world.openbeautyfacts.org',
  },
};

export function openFactsUrl(kind: OpenFactsKind, gtin: string): string {
  return `${HOSTS[kind].base}/api/v2/product/${encodeURIComponent(gtin)}.json`;
}

export function openFactsSource(kind: OpenFactsKind): GtinSource {
  return HOSTS[kind].source;
}

/** Map Open*Facts API JSON (v2) into a lookup result. */
export function mapOpenFactsResponse(
  kind: OpenFactsKind,
  body: unknown
): GtinLookupResult {
  const source = HOSTS[kind].source;
  if (!body || typeof body !== 'object') {
    return { source, found: false };
  }
  const root = body as Record<string, unknown>;
  const status = root.status;
  // status 0 = not found; status 1 = found (v0/v2 styles vary)
  if (status === 0 || status === '0') {
    return { source, found: false, raw: { status } };
  }
  const product = (root.product ?? root) as Record<string, unknown>;
  const name =
    (product.product_name_en as string) ||
    (product.product_name as string) ||
    (product.generic_name as string) ||
    null;
  const brand =
    (product.brands as string)?.split(',')[0]?.trim() ||
    (product.brand_owner as string) ||
    null;
  const image =
    (product.image_front_url as string) ||
    (product.image_url as string) ||
    null;
  if (!name?.trim()) {
    return { source, found: false, raw: { status: root.status } };
  }
  return {
    source,
    found: true,
    name: name.trim(),
    brand: brand?.trim() || null,
    image_url: image,
    raw: { code: root.code, status: root.status },
  };
}

export const OPEN_FACTS_KINDS: OpenFactsKind[] = ['products', 'food', 'beauty'];
