// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Draws nothing. Lives in the till's banner (always mounted on the till) and
// keeps the words on the cafe's kitchen-dish tiles current: re-reads the setup
// every half minute while the tab is visible, and at once when the till goes
// on- or offline. The catalog is `vertical-cafe`'s; this module only hands
// the host its marks (`setTileMarks`, platform 25), and the catalog draws them.

import { useEffect } from 'react';
import { isOnline, onOnlineChange, tileMarkSetter } from '../lib/hostPlatform';
import { readSetupShared, SIDES_FRESH_MS } from '../lib/sides';
import { rememberedSetup } from '../lib/setupMemory';
import { cafeTileMarks } from './marks';

export const TILE_MARKS_REFRESH_MS = SIDES_FRESH_MS;

export function CafeTileMarks(): null {
  useEffect(() => {
    const setMarks = tileMarkSetter();
    if (!setMarks) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The last answer the server gave: going offline needs no new read — the
    // offline words come from what is already known.
    let lastCafe: unknown = undefined;

    const publish = () => {
      if (!alive || lastCafe === undefined) return;
      setMarks(cafeTileMarks(lastCafe, isOnline()));
    };

    const refresh = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (visible && isOnline()) {
        try {
          const setup = await readSetupShared();
          lastCafe = setup.as_cafe ?? null;
        } catch {
          // A failed read keeps the last words: the till's offline banner says the rest.
        }
      }
      // Offline from the start: the last setup this till kept still names the dishes (§8).
      if (lastCafe === undefined) {
        const kept = rememberedSetup();
        if (kept) lastCafe = kept.as_cafe ?? null;
      }
      publish();
      if (alive) timer = setTimeout(() => void refresh(), TILE_MARKS_REFRESH_MS);
    };

    const offOnline = onOnlineChange(() => void refresh());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    void refresh();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      offOnline();
      document.removeEventListener('visibilitychange', onVisible);
      setMarks(null);
    };
  }, []);
  return null;
}
