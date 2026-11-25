// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The last `GET /remote-kitchen/setup` this till got, kept for when it has no
// network (РК5, TechDocs/POS_REMOTE_KITCHEN.md §8). Offline the till still has
// to know which dishes are the kitchen's and its phone: without it a pizza
// would be sold off the cafe's own shelf and the kitchen would never hear of
// it. Per store, so a till signed in elsewhere never reads another's kitchen;
// a week old at most, since a link changes rarely but does change.

import { currentStoreId } from './hostPlatform';
import type { RawSetup } from './sides';

/** One entry per store, so a till two stores share keeps each one's kitchen. */
const KEY_PREFIX = 'remote-kitchen:setup:v1:';
/** What the tiles kept before this file (one per store, the cafe half only): removed on the next write. */
const LEGACY_TILES_PREFIX = 'remote-kitchen:tiles:';
export const SETUP_MEMORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Kept {
  store_id: number;
  at: number;
  setup: RawSetup;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Keep a setup the server just gave for `storeId` — the store the read was
 * made for. An answer that lands after someone signed into another store is
 * dropped: it would put one store's kitchen into another's offline memory.
 * A store with no link keeps that too.
 */
export function rememberSetup(
  setup: RawSetup | null | undefined,
  storeId: number | null,
  now: number = Date.now()
): void {
  const box = storage();
  if (storeId == null || storeId !== currentStoreId() || !box || !setup || typeof setup !== 'object') return;
  try {
    const kept: Kept = {
      store_id: storeId,
      at: now,
      setup: { as_cafe: setup.as_cafe ?? null, as_kitchen: setup.as_kitchen ?? null },
    };
    box.setItem(KEY_PREFIX + storeId, JSON.stringify(kept));
    box.removeItem(LEGACY_TILES_PREFIX + storeId);
  } catch {
    // A full or blocked storage: offline the till simply knows less.
  }
}

/** The last setup of the signed-in store, or null — too old, unreadable, or none. */
export function rememberedSetup(now: number = Date.now()): RawSetup | null {
  const storeId = currentStoreId();
  const box = storage();
  if (storeId == null || !box) return null;
  try {
    const raw = box.getItem(KEY_PREFIX + storeId);
    if (!raw) return null;
    const kept = JSON.parse(raw) as Partial<Kept>;
    if (kept.store_id !== storeId || typeof kept.at !== 'number' || now - kept.at > SETUP_MEMORY_MAX_AGE_MS)
      return null;
    return kept.setup && typeof kept.setup === 'object' ? kept.setup : null;
  } catch {
    return null;
  }
}
