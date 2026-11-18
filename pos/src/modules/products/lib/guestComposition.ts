// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Склад для гостя» is what the owner — or the café's marketer — WRITES, never
// the recipe (a recipe lists stock, a cup or a lid among it, and misses what
// a modifier adds). But the recipe is the best first draft there is, so the
// field offers its words to pick from: «рібай», «масло вершкове», «соус
// демі-глас» — names only, the grams being the kitchen's (МР5). A prep is
// named as itself, not as the water and bones it is made of: that is how a
// guest reads a dish.
//
// Pure: `guestComposition.test.ts` pins it.

import type { Product } from '@pos/platform';

/** How a recipe line names what goes in: the product, and the variant when it has one. */
export interface RecipeLineName {
  product_name?: string | null;
  label?: string | null;
}

/**
 * The word a guest reads for one ingredient: «Соус демі-глас, порція» is a
 * sauce, so what follows the first comma (a prep's portion, a pack size) is
 * left out; the first letter is lowered unless the name is an abbreviation.
 */
export function guestWord(line: RecipeLineName): string {
  // A line the server named nothing (an older answer, a draft line still being picked) gives no word.
  const name = String(line.product_name ?? '').split(',')[0].trim();
  if (name === '') return '';
  const label = (line.label ?? '').trim();
  const text = label ? `${name} ${label}` : name;
  if (text.length > 1 && text[1] === text[1].toLocaleUpperCase('uk') && text[1] !== text[1].toLocaleLowerCase('uk')) {
    return text;
  }
  return text.charAt(0).toLocaleLowerCase('uk') + text.slice(1);
}

/** The recipe's words, once each, in the order the recipes list them — every size of the dish together. */
export function recipeWords(product: Pick<Product, 'variants'> | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const variant of product?.variants ?? []) {
    if (variant.is_active === false) continue;
    for (const line of variant.components ?? []) {
      const word = guestWord(line);
      const key = word.toLocaleLowerCase('uk');
      if (word === '' || seen.has(key)) continue;
      seen.add(key);
      out.push(word);
    }
  }
  return out;
}

/** Whether the text already names this word — so the hint offers only what is not written yet. */
export function mentions(text: string, word: string): boolean {
  return text.toLocaleLowerCase('uk').includes(word.toLocaleLowerCase('uk'));
}

/** The text with the word added the way a list is written: «Рібай, масло вершкове». */
export function appendWord(text: string, word: string): string {
  const body = text.replace(/\s+$/, '');
  if (body === '') return word.charAt(0).toLocaleUpperCase('uk') + word.slice(1);
  return /[,;]$/.test(body) ? `${body} ${word}` : `${body}, ${word}`;
}

/** Every word not written yet, added in order. */
export function appendAll(text: string, words: readonly string[]): string {
  return words.filter((w) => !mentions(text, w)).reduce(appendWord, text);
}
