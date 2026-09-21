// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's own daily order number for a sale it queued offline (К3d).
//
// A café's counter calls a number, and a till that has no network still has
// a barista and a kitchen. The server's `order_no` cannot exist before the
// sale reaches it, so the desktop counts its own — «К1», «К2» — per
// device-local day, and says so on screen and on paper. The «К» is the point:
// «17» and «К17» must never be mistaken for one another, because the server
// hands out its own number at sync, and the kitchen already made «К17».
//
// Pure: the counter lives in the offline `meta` table (`repository.ts`), the
// arithmetic lives here so it can be pinned by a test.

export interface LocalOrderCounter {
  /** The device-local day (YYYY-MM-DD) the counter belongs to. */
  day: string;
  /** The number the next queued sale of that day receives. */
  next: number;
}

/** The device's own calendar day as YYYY-MM-DD — the till stands in the shop, so its clock is the shop's. */
export function deviceLocalDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Issue the next number: a new day starts at 1, the same day continues. A
 * counter that is missing, malformed or from another day is simply a new day.
 */
export function advanceLocalOrderNo(
  prev: LocalOrderCounter | null | undefined,
  day: string
): { counter: LocalOrderCounter; issued: number } {
  const sameDay = prev != null && prev.day === day && Number.isInteger(prev.next) && prev.next > 0;
  const issued = sameDay ? prev.next : 1;
  return { counter: { day, next: issued + 1 }, issued };
}

/** How the number reads everywhere it is shown — «К17», never a bare «17». */
export function localOrderLabel(n: number): string {
  return `К${n}`;
}
