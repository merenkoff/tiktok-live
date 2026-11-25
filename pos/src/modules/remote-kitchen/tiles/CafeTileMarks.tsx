// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Draws nothing. Lives in the till's banner (always mounted on the till) and
// keeps the words on the cafe's kitchen-dish tiles current: re-reads the setup
// every half minute while the tab is visible and the store is a cafe of some
// kitchen — every ten minutes otherwise, the strips' own pace — and at once
// when the till goes on- or offline or the tab comes back. The catalog is
// `vertical-cafe`'s; this module only hands the host its marks
// (`setTileMarks`, platform 25), and the catalog draws them.
//
// ONE loop: a refresh asked for while another is reading runs once more after
// it rather than beside it, and only the loop sets the next timer — two
// overlapping refreshes used to leave two timers, and the loops multiplied.

import { useEffect } from 'react';
import { currentStoreId, isOnline, onOnlineChange, sellsByPhoneOffline, tileMarkSetter } from '../lib/hostPlatform';
import { rememberedSetup } from '../lib/setupMemory';
import { readSetupShared } from '../lib/sides';
import { cafeTileMarks } from './marks';

export const TILE_MARKS_REFRESH_MS = 30_000;
/** A store that is no cafe of any kitchen asks again this rarely — as the banner's strips do. */
export const TILE_MARKS_NOT_CAFE_MS = 10 * 60_000;
/**
 * The tiles never take a shared setup older than this: with the half-minute
 * refresh a pause reaches them within about 35 s, not a minute.
 */
export const TILE_MARKS_MAX_AGE_MS = 5_000;

export function CafeTileMarks(): null {
  useEffect(() => {
    const setMarks = tileMarkSetter();
    if (!setMarks) return undefined;
    const store = currentStoreId();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let again = false;
    // The last cafe half the server gave — before the first answer, the one
    // this device kept (`lib/setupMemory.ts`, per store), so a till that starts
    // offline still knows the kitchen's dishes and says «дзвінок на кухню» on
    // them (§8). Undefined = nothing known yet.
    const kept = rememberedSetup();
    let lastCafe: unknown = kept ? (kept.as_cafe ?? null) : undefined;

    const publish = () => {
      if (!alive || lastCafe === undefined) return;
      setMarks(cafeTileMarks(lastCafe, isOnline(), sellsByPhoneOffline()));
    };

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = alive ? setTimeout(() => void refresh(), ms) : null;
    };

    const refresh = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
          if (visible && isOnline()) {
            try {
              const setup = await readSetupShared(Date.now(), store, TILE_MARKS_MAX_AGE_MS);
              // `readSetupShared` keeps it on this device for the next offline start.
              lastCafe = setup.as_cafe ?? null;
            } catch {
              // A failed read keeps the last words: the till's offline banner says the rest.
            }
          }
          publish();
        } while (again && alive);
      } finally {
        running = false;
      }
      schedule(lastCafe === null ? TILE_MARKS_NOT_CAFE_MS : TILE_MARKS_REFRESH_MS);
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
