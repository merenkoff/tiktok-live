// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/searchTokens.ts — how a till's search box reads what was typed
// (TechDocs/POS_CLOTHING.md, phase C1).
//
// The box used to take the whole text as ONE substring, so «зайчик 86» found
// nothing (no single field contains both words) and «98/104» did not find a
// variant written «98-104». It now reads words: every word has to match
// SOMETHING about the variant, in any order — the way a person searches.
//
// Pure, and mirrored by `pos/src/lib/searchTokens.ts` (the offline till must
// find what the online one finds, or a cashier learns not to trust the box);
// `pos.search-tokens.test.ts` and its client twin pin the same table of cases.

/** More words than this are ignored: a pasted paragraph is not a search. */
export const MAX_SEARCH_WORDS = 6;

/** One word is never longer than this; the rest is dropped. */
const MAX_WORD_LENGTH = 64;

/**
 * A number this short is a size, an age or a height — «86», «104», «9» — and
 * must not be looked for INSIDE an article number or a barcode, where any EAN
 * has some «86» in it. It still finds an article or a barcode that IS exactly
 * that number (a shop whose articles are «101», «102»…). Four digits and up
 * (an article, a year, a scan) search inside them as before.
 */
const SHORT_NUMBER = /^\d{1,3}$/;

export interface SearchToken {
  /** Lower-cased, separators folded — compared against `foldSeparators(field)`. */
  text: string;
  /**
   * True for a short pure number: name, label and attributes by substring,
   * article and barcode only when they ARE this number.
   */
  shortNumber: boolean;
}

/**
 * The same text with «98-104», «98–104», «98—104» and «98/104» all spelled one
 * way, so a range typed with a slash finds the one saved with a hyphen. Applied
 * to the query AND to every field it is compared with (SQL: `translate`).
 */
export function foldSeparators(text: string): string {
  return text.replace(/[–—/]/g, '-');
}

/** `%`, `_` and `\` are LIKE syntax; a typed one must mean itself. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * What was typed → the words to find. Empty for an empty or blank box.
 * Lower-casing is the caller's locale-free `toLowerCase`, exactly what the
 * single-substring search did.
 */
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
