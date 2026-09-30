// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One interval that sleeps with the tablet (phase Q7).
//
// The hall map has always polled like this, inline; the bill screen and the
// guests' requests now need the same thing, and three copies of a rule about
// a sleeping tablet would drift the first time it changed.

import { useEffect, useRef } from 'react';

export const POLL_MS = 10000;

/**
 * Call `tick` every `ms` while `enabled`, and once more the moment the tab
 * comes back into view.
 *
 * A tab nobody is looking at polls nothing: the waiter's tablet sleeps in an
 * apron pocket half the evening. The check reads `visibilityState` rather
 * than the shorter boolean property, and that word is kept out of this file's
 * text on purpose: Tailwind scans module source for class candidates, so it
 * would emit a bare `display:none` utility into the module's stylesheet and
 * override the host's responsive layout — К3c lost an afternoon to exactly
 * that.
 *
 * The extra call on return is what makes a request that arrived while the
 * screen was off show up when the waiter wakes it, instead of ten seconds
 * later — ten seconds is a long time to a guest holding a phone.
 */
export function useVisiblePoll(tick: () => void | Promise<void>, enabled: boolean, ms: number = POLL_MS): void {
  // The latest `tick` without re-arming the timer on every render.
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const seen = (): boolean => document.visibilityState === 'visible';
    const id = setInterval(() => {
      if (seen()) void latest.current();
    }, ms);
    const onReturn = (): void => {
      if (seen()) void latest.current();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [enabled, ms]);
}
