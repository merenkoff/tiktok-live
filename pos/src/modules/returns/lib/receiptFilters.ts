// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';

export type ReceiptPeriod = 'all' | 'today' | 'week';

export const PERIOD_OPTIONS = [
  { value: 'all', label: 'Усі' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: '7 днів' },
] as const;

/** `YYYY-MM-DD` on this device's calendar — the owner's device sits in the store's zone. */
export function localDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA').format(at);
}

/** The first day of a period, or nothing for «Усі». Inclusive, like the server's `from`. */
export function periodFrom(period: ReceiptPeriod, now: Date = new Date()): string | undefined {
  if (period === 'today') return localDay(now);
  if (period === 'week') return localDay(new Date(now.getTime() - 6 * 86_400_000));
  return undefined;
}

/** The value after it has stopped changing for `delayMs` — typing «кепка» asks once, not five times. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
