// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A long grid drawn a screenful at a time (TechDocs/POS_CLOTHING.md «Головна
// каси й швидкість фото»). The till's catalog held every product of the shop
// in one grid — on the desktop, straight out of IndexedDB with no limit at
// all — so a shop with a few hundred photographed products laid out, and
// decoded pictures for, every one of them before the first tap.
//
// The first `step` items are drawn; the next `step` join when a sentinel after
// the last one comes within `margin` of the scroll container's edge. A new
// `resetKey` (another folder, another search) starts again from the top.
// Without IntersectionObserver (jsdom, a very old webview) everything is drawn,
// exactly as before.

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ProgressiveList<T> {
  visible: readonly T[];
  hasMore: boolean;
  /** Put on an empty element right after the grid. */
  sentinelRef: RefObject<HTMLDivElement>;
}

export function useProgressiveList<T>(
  items: readonly T[],
  resetKey: string,
  opts: { step?: number; root?: RefObject<HTMLElement>; margin?: string } = {}
): ProgressiveList<T> {
  const step = opts.step ?? 60;
  const observe = typeof IntersectionObserver !== 'undefined';
  const [state, setState] = useState({ key: resetKey, limit: step });
  // Another folder or search: back to the first screenful, in this render.
  const limit = state.key === resetKey ? state.limit : step;
  if (state.key !== resetKey) setState({ key: resetKey, limit: step });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const root = opts.root;
  const margin = opts.margin ?? '800px';

  useEffect(() => {
    const el = sentinelRef.current;
    if (!observe || !el || limit >= items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState((s) => (s.key === resetKey ? { key: s.key, limit: s.limit + step } : s));
        }
      },
      { root: root?.current ?? null, rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [observe, limit, items.length, step, root, margin, resetKey]);

  if (!observe) return { visible: items, hasMore: false, sentinelRef };
  return { visible: items.slice(0, limit), hasMore: limit < items.length, sentinelRef };
}
