// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's dishes the kitchen cooks, as their tiles should read right now
// (РК5, TechDocs/POS_REMOTE_KITCHEN.md §8): «кухня ≈30 хв» — the promise the
// kitchen's own numbers suggest for that dish alone, road included, rounded
// up to five as the server rounds it; «пауза» while the kitchen takes nothing;
// «кухня вимкнена» while the link is paused; «потрібна мережа» offline, since a
// request the kitchen never gets is no request. The last three grey the tile.

import type { TileMark } from '../lib/hostPlatform';

interface CafeHalf {
  link?: { status?: unknown; transit_minutes?: unknown };
  kitchen?: { accepting?: unknown; load_minutes?: unknown };
  items?: Array<{ cafe_variant_id?: unknown; prep_minutes?: unknown }>;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The server's `roundUpToFive`: «буде о 19:40», never 19:37. */
export function roundUpToFive(minutes: number): number {
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

/** One dish's word, from its time, the kitchen's queue and the road. */
export function dishWord(prep: number | null, load: number, transit: number): string {
  return prep == null ? 'готує кухня' : `кухня ≈${roundUpToFive(prep + load + transit)} хв`;
}

/**
 * Marks by the cafe's variant id, or null when this store asks no kitchen (or
 * the setup says nothing usable) — then nothing is put on any tile.
 */
export function cafeTileMarks(asCafe: unknown, online: boolean): Record<number, TileMark> | null {
  const half = asCafe as CafeHalf | null | undefined;
  if (!half || typeof half !== 'object' || !half.link) return null;
  const items = Array.isArray(half.items) ? half.items : [];
  if (items.length === 0) return null;

  let blockedWord: string | null = null;
  if (!online) blockedWord = 'потрібна мережа';
  else if (half.link.status !== 'active') blockedWord = 'кухня вимкнена';
  else if (half.kitchen?.accepting === false) blockedWord = 'пауза';

  const load = Math.max(0, num(half.kitchen?.load_minutes) ?? 0);
  const transit = Math.max(0, num(half.link.transit_minutes) ?? 0);
  const marks: Record<number, TileMark> = {};
  for (const item of items) {
    const id = num(item?.cafe_variant_id);
    if (id == null) continue;
    marks[id] = blockedWord
      ? { text: blockedWord, blocked: true }
      : { text: dishWord(num(item.prep_minutes), load, transit), blocked: false };
  }
  return Object.keys(marks).length > 0 ? marks : null;
}
