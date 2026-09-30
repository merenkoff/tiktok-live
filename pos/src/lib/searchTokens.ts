// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of `src/pos/searchTokens.ts` (TechDocs/POS_CLOTHING.md, C1):
// how the search box reads what was typed. The offline till must find exactly
// what the online one finds, or a cashier learns not to trust the box — so the
// cases in `searchTokens.test.ts` are the same table the server runs against
// Postgres (`src/__tests__/pos.catalog-search.test.ts`).
//
// Every WORD has to match something about the variant, in any order:
// «зайчик 86» is a product and a size, and no single field holds both.

/** More words than this are ignored: a pasted paragraph is not a search. */
export const MAX_SEARCH_WORDS = 6;

const MAX_WORD_LENGTH = 64;

/**
 * A number this short is a size, an age or a height — «86», «104», «9» — and
 * must not be looked for INSIDE an article or a barcode, where any EAN has some
 * «86» in it. It still finds an article or a barcode that IS exactly that number.
 */
const SHORT_NUMBER = /^\d{1,3}$/;

export interface SearchToken {
  /** Lower-cased, separators folded — compared against `foldSeparators(field)`. */
  text: string;
  /** A short pure number: name/label/attributes by substring, codes only exactly. */
  shortNumber: boolean;
}

/**
 * «98-104», «98–104», «98—104» and «98/104» spelled one way, so a range typed
 * with a slash finds the one saved with a hyphen. Applied to the query AND to
 * every field it is compared with.
 */
export function foldSeparators(text: string): string {
  return text.replace(/[–—/]/g, '-');
}

/** What was typed → the words to find. Empty for an empty or blank box. */
export function searchTokens(query: string | null | undefined): SearchToken[] {
  const words = foldSeparators(String(query ?? '').toLowerCase())
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_WORDS);
  return words.map((word) => {
    const text = word.slice(0, MAX_WORD_LENGTH);
    return { text, shortNumber: SHORT_NUMBER.test(text) };
  });
}

interface Searchable {
  product_name: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  attributes?: Record<string, unknown> | null;
}

const fold = (text: string) => foldSeparators(text.toLowerCase());

/** Does one variant satisfy one word? The mirror of the server's per-word SQL condition. */
export function matchesToken(item: Searchable, token: SearchToken, searchKeys: readonly string[]): boolean {
  const { text } = token;
  if (fold(item.product_name).includes(text)) return true;
  if (fold(item.label).includes(text)) return true;
  for (const key of searchKeys) {
    const value = item.attributes?.[key];
    if (value != null && fold(String(value)).includes(text)) return true;
  }
  const sku = item.sku ?? '';
  const barcode = item.barcode ?? '';
  if (token.shortNumber) return sku.toLowerCase() === text || barcode === text;
  return fold(sku).includes(text) || fold(barcode).includes(text);
}
