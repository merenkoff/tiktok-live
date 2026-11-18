// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product list as the café's marketer reads it (track МР, МР5): the menu,
// not the storeroom. What the guest is sold — never an ingredient or a prep,
// which the kitchen keeps under «Товари» too — and, beside every dish, what
// the guest would miss on the QR menu: a photo, a description, the
// composition. Those three are her to-do list, so they are also the filters.
//
// Pure: `menuGaps.test.ts` pins it.

import type { PosTag, Product } from '@pos/platform';

/** What a dish lacks on the guest's page. */
export type MenuGap = 'photo' | 'description' | 'composition';

export const GAP_WORDS: Record<MenuGap, string> = {
  photo: 'Без фото',
  description: 'Без опису',
  composition: 'Без складу страви',
};

/** What the marketer's list holds: the dishes the till sells, not the shelves behind them. */
export function menuProducts(products: readonly Product[]): Product[] {
  return products.filter((p) => p.sellable !== false);
}

/**
 * What the guest would miss on this dish's card. A card hidden from the QR
 * menu misses nothing there, and a card made from a receiving document shows
 * the guest no description at all until it is edited — said once by its own
 * filter, «Нові — заповніть», rather than as three gaps.
 */
export function menuGaps(product: Product): MenuGap[] {
  if (product.menu_hidden) return [];
  const gaps: MenuGap[] = [];
  if (!product.image_url) gaps.push('photo');
  if (!product.description?.trim()) gaps.push('description');
  if (!product.composition?.trim()) gaps.push('composition');
  return gaps;
}

export function hasGap(product: Product, gap: MenuGap): boolean {
  return menuGaps(product).includes(gap);
}

/**
 * The tag tree without the branches that hold no dish: «Інгредієнти» is the
 * kitchen's shelf label, and a filter that always shows an empty list is noise.
 * A tag stays while it or any tag under it is worn by one of `products`.
 */
export function pruneTags(tags: readonly PosTag[], products: readonly Product[]): PosTag[] {
  const worn = new Set<number>();
  for (const product of products) for (const id of product.tag_ids ?? []) worn.add(id);
  const walk = (list: readonly PosTag[]): PosTag[] =>
    list.flatMap((tag) => {
      const children = walk(tag.children ?? []);
      if (!worn.has(tag.id) && children.length === 0) return [];
      return [{ ...tag, children }];
    });
  return walk(tags);
}
