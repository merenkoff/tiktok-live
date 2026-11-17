// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's own food-cost target («не більше 30 %»). Theirs, not ours: a
// florist's bouquet and a café's coffee live at different numbers, so nothing
// is flagged «too high» until the owner says what high is. Kept on the device
// — it is a way of looking at the menu, not a fact about the store.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'products:foodCostTarget';
const EVENT = 'products:foodCostTarget';

/** Basis points (3000 = 30 %), or null while the owner has named none. */
export function readFoodCostTarget(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const bps = raw == null ? NaN : Number(raw);
    return Number.isInteger(bps) && bps >= 100 && bps <= 9900 ? bps : null;
  } catch {
    return null;
  }
}

export function writeFoodCostTarget(bps: number | null): void {
  try {
    if (bps == null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(bps));
  } catch {
    /* a private window: the target lives for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A typed «30» / «32,5» → basis points, or null for an empty or senseless one. */
export function parseTargetPercent(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 1 || n > 99) return null;
  return Math.round(n * 100);
}

/** The target, shared by every editor on the page: one changes it, all follow. */
export function useFoodCostTarget(): [number | null, (bps: number | null) => void] {
  const [target, setTarget] = useState<number | null>(() => readFoodCostTarget());
  useEffect(() => {
    const sync = () => setTarget(readFoodCostTarget());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const set = useCallback((bps: number | null) => writeFoodCostTarget(bps), []);
  return [target, set];
}
