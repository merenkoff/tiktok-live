// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The buyer's age, asked once per receipt (migration 102,
// TechDocs/POS_AGE_CHECK.md). Pure: which lines are sold to an adult only, and
// whether this cart needs the question at all.

import type { CatalogItem } from '../types';

/**
 * Whether a line rung off this card with these answers is sold to an adult
 * only: the card itself (excise goods, a recipe pouring from them), or one of
 * the chosen answers (cognac in a coffee).
 */
export function ageRestricted(item: Pick<CatalogItem, 'age_restricted' | 'modifier_groups'>, chosenIds: readonly number[]): boolean {
  if (item.age_restricted === true) return true;
  if (chosenIds.length === 0) return false;
  const chosen = new Set(chosenIds);
  return (item.modifier_groups ?? []).some((g) => g.modifiers.some((m) => chosen.has(m.id) && m.age_restricted === true));
}

/** The lines of a cart that are sold to an adult only. */
export function adultOnlyLines<T extends { age_restricted?: boolean }>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.age_restricted === true);
}

/** Whether «Оплатити» should first ask «Покупцю є 18 років?». */
export function needsAgeCheck(
  lines: ReadonlyArray<{ age_restricted?: boolean }>,
  storeAsks: boolean | undefined,
  alreadyConfirmed: boolean
): boolean {
  return storeAsks === true && !alreadyConfirmed && adultOnlyLines(lines).length > 0;
}
