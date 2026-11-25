// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's half of the last setup the server gave, kept on this device per
// store: a till that starts with no network still knows which tiles are the
// kitchen's and greys them «потрібна мережа», instead of leaving them looking
// sellable until its first read. Only what the tile words need is kept, and
// a blocked storage (private window, a webview without it) keeps nothing.

const KEY_PREFIX = 'remote-kitchen:tiles:';

interface RememberedCafe {
  link: { status: unknown; transit_minutes: unknown };
  kitchen: { accepting: unknown; load_minutes: unknown };
  items: Array<{ cafe_variant_id: unknown; prep_minutes: unknown; available: unknown }>;
}

function slim(asCafe: unknown): RememberedCafe | null {
  const half = asCafe as {
    link?: { status?: unknown; transit_minutes?: unknown };
    kitchen?: { accepting?: unknown; load_minutes?: unknown };
    items?: Array<{ cafe_variant_id?: unknown; prep_minutes?: unknown; available?: unknown }>;
  } | null;
  if (!half || typeof half !== 'object' || !half.link) return null;
  return {
    link: { status: half.link.status, transit_minutes: half.link.transit_minutes },
    kitchen: { accepting: half.kitchen?.accepting, load_minutes: half.kitchen?.load_minutes },
    items: (Array.isArray(half.items) ? half.items : []).map((item) => ({
      cafe_variant_id: item?.cafe_variant_id,
      prep_minutes: item?.prep_minutes,
      available: item?.available,
    })),
  };
}

/** What the last session kept for this store: the cafe half, null (no cafe), or undefined (nothing kept). */
export function rememberedCafe(store: number | null): unknown {
  if (store == null) return undefined;
  try {
    const raw = globalThis.localStorage?.getItem(KEY_PREFIX + store);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Keeps what the server just said, for the next session that starts offline. */
export function rememberCafe(store: number | null, asCafe: unknown): void {
  if (store == null) return;
  try {
    globalThis.localStorage?.setItem(KEY_PREFIX + store, JSON.stringify(slim(asCafe)));
  } catch {
    // A full or blocked storage: the tiles just wait for the network next time.
  }
}
