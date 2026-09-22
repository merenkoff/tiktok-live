// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The two rules «Техкарти» rests on, as pure functions so they can be pinned
// without rendering anything.

import type { TechCardRow } from './techCardsApi';

/**
 * Why this card has no honest food cost — or null when it has one.
 *
 * The server already decided (`food_cost_bps === null`); this only puts the
 * reason into words, because «—» with no explanation sends the owner to look
 * for a bug instead of to the thing that is actually missing. Checked in the
 * order the owner can act on: a recipe first, then a price, then the
 * ingredient nobody has ever received with a cost.
 */
export function missingReason(row: TechCardRow): string | null {
  if (row.food_cost_bps != null) return null;
  if (row.leaf_count === 0) return 'немає рецепта';
  if (row.price_cents <= 0) return 'немає ціни продажу';
  if (row.has_unpriced_leaf) return 'не вистачає собівартості складника';
  return 'немає даних';
}

/** 2500 bps → «25,0 %». One definition: the page and the product card both draw it. */
export function foodCostPercent(bps: number): string {
  return `${(bps / 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * Worst first: the dishes eating the most of their own price at the top.
 *
 * Rows with no percentage go to the END, whatever their cost. «Невідомо» is
 * not a place on a list of the worst offenders — putting them first would
 * bury the real ones under the unknown ones. Among themselves they keep the
 * server's order, which is by name.
 */
export function sortTechCards(rows: readonly TechCardRow[]): TechCardRow[] {
  return [...rows].sort((a, b) => {
    const left = a.food_cost_bps;
    const right = b.food_cost_bps;
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return right - left;
  });
}
