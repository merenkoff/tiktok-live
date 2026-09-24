// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';

/** Tailwind's `lg` — where the bill gets its own column beside the menu. */
const WIDE = '(min-width: 1024px)';

/**
 * Whether the screen is wide enough for two panes.
 *
 * A hook rather than `hidden lg:flex` on both, because the bill pane carries
 * test ids and the totals: rendered twice — once hidden — every «bill-owed»
 * would be two elements. One place decides, one pane renders.
 */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(WIDE).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(WIDE);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
