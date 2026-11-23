// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's home screen (migration 112, TechDocs/POS_CLOTHING.md «Головна
// каси й швидкість фото»): what the cashier sees before choosing a folder.
//
// A shop with a few hundred photographed products used to land on every one
// of them. Now the root shows the folders, then the cards the owner ticked
// «На головному екрані каси» — or, while nothing is ticked, the 24 that sold
// most in 30 days — and «Усі товари» is one chip away. A shop with neither
// (a new one) sees every product, exactly as before.

import type { CatalogItem } from '../types';

export type TillHomeKind = 'marked' | 'popular';

export interface TillHome {
  kind: TillHomeKind;
  /** The rows to show, a card's variants together. */
  items: CatalogItem[];
}

/** The heading over the home screen's cards. */
export const TILL_HOME_TITLE: Record<TillHomeKind, string> = {
  marked: 'На головній',
  popular: 'Часто продають',
};

/**
 * What the home screen shows out of a `home` answer (the ticked cards and the
 * ranked sellers, online or from the snapshot): the ticked cards in catalogue
 * order when there are any, else the sellers by rank, else null — the till
 * then shows everything.
 */
export function pickTillHome(rows: readonly CatalogItem[]): TillHome | null {
  const marked = rows.filter((row) => row.till_home === true);
  if (marked.length > 0) return { kind: 'marked', items: marked };
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.popular_rank != null)
    // By rank, and a card's variants in the order they came.
    .sort((a, b) => (a.row.popular_rank as number) - (b.row.popular_rank as number) || a.index - b.index)
    .map(({ row }) => row);
  return ranked.length > 0 ? { kind: 'popular', items: ranked } : null;
}

/** How many cards (products) a list of rows holds. */
export function countCards(rows: readonly CatalogItem[]): number {
  return new Set(rows.map((row) => row.product_id)).size;
}
