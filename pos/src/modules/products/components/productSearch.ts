// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The search box above the admin's product list (TechDocs/POS_CLOTHING.md, C1):
// the list had only a tag filter, and a shop of several hundred garments is not
// browsed, it is searched. Reads the query the same way the till does — words,
// every one of which has to match, `98/104` ≡ `98-104`, a short number a size —
// because it is the same two helpers (`lib/searchTokens.ts`).
//
// A product matches when EACH word matches its name or any one of its active
// variants (caption, colour/size, article, barcode): «зайчик 86» is a name and a
// size that live on different rows of one card.

import { matchesToken, searchTokens } from '../../../lib/searchTokens';

interface SearchableVariant {
  label?: string | null;
  sku?: string | null;
  barcode?: string | null;
  is_active?: boolean;
  attributes?: Record<string, unknown> | null;
}

interface SearchableProduct {
  name: string;
  variants: ReadonlyArray<SearchableVariant>;
}

/** The attributes worth reading on an admin list: a caption already holds them, but a label is derived and these are the source. */
const ADMIN_SEARCH_KEYS = ['color', 'size'];

export function productMatchesQuery(product: SearchableProduct, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const variants = product.variants.filter((v) => v.is_active !== false);
  return tokens.every((token) => {
    if (matchesToken({ product_name: product.name, label: '', sku: null, barcode: null }, token, [])) return true;
    return variants.some((v) =>
      matchesToken(
        {
          product_name: '',
          label: v.label ?? '',
          sku: v.sku ?? null,
          barcode: v.barcode ?? null,
          attributes: v.attributes ?? null,
        },
        token,
        ADMIN_SEARCH_KEYS
      )
    );
  });
}
