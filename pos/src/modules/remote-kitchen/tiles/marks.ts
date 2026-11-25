// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's dishes the kitchen cooks, as their tiles should read right now
// (РК5, TechDocs/POS_REMOTE_KITCHEN.md §8): «кухня ≈30 хв» — the promise the
// kitchen's own numbers suggest for that dish alone, road included, rounded
// up to five as the server rounds it; «пауза» while the kitchen takes nothing;
// «кухня вимкнена» while the link is paused; «немає на кухні» for a dish the
// kitchen has on today's stop list or retired (`available: false`, the same
// test the server refuses a request by) — those three grey the tile. Offline
// the dish still sells on the desktop, on the kitchen's word by phone (§8):
// «дзвінок на кухню», and the till's «З кухні» block takes the time the
// kitchen names; a stop list read before the network went is not trusted over
// that call. A till that queues no offline sale (the web, the tablet) cannot
// sell it so: «потрібна мережа», grey, as before.

import type { TileMark } from '../lib/hostPlatform';

interface CafeHalf {
  link?: { status?: unknown; transit_minutes?: unknown };
  kitchen?: { accepting?: unknown; load_minutes?: unknown };
  items?: Array<{ cafe_variant_id?: unknown; prep_minutes?: unknown; available?: unknown }>;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A kitchen dish offline: still sold, after a call (§8). */
export const OFFLINE_WORD = 'дзвінок на кухню';
/** A kitchen dish offline on a till that cannot sell it by phone. */
export const NO_NETWORK_WORD = 'потрібна мережа';

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
export function cafeTileMarks(
  asCafe: unknown,
  online: boolean,
  /** Offline, may a kitchen dish be sold here on the kitchen's word by phone (`sellsByPhoneOffline`). */
  byPhone: boolean = true
): Record<number, TileMark> | null {
  const half = asCafe as CafeHalf | null | undefined;
  if (!half || typeof half !== 'object' || !half.link) return null;
  const items = Array.isArray(half.items) ? half.items : [];
  if (items.length === 0) return null;

  let blockedWord: string | null = null;
  if (!online && !byPhone) blockedWord = NO_NETWORK_WORD;
  else if (half.link.status !== 'active') blockedWord = 'кухня вимкнена';
  // Offline the kitchen's pause is not known, and by phone it can still say yes.
  else if (online && half.kitchen?.accepting === false) blockedWord = 'пауза';

  const load = Math.max(0, num(half.kitchen?.load_minutes) ?? 0);
  const transit = Math.max(0, num(half.link.transit_minutes) ?? 0);
  const marks: Record<number, TileMark> = {};
  for (const item of items) {
    const id = num(item?.cafe_variant_id);
    if (id == null) continue;
    marks[id] = blockedWord
      ? { text: blockedWord, blocked: true }
      : !online
        ? { text: OFFLINE_WORD, blocked: false }
        : item.available === false
          ? { text: 'немає на кухні', blocked: true }
          : { text: dishWord(num(item.prep_minutes), load, transit), blocked: false };
  }
  return Object.keys(marks).length > 0 ? marks : null;
}
