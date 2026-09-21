// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Сьогодні не робимо» as the till reads it (café phase К3, migration 050).
//
// The server sends both the verdict (`stop_listed`, on ITS clock) and the raw
// store-local day (`stop_listed_on`). The till compares the day itself, on the
// device's clock: an offline snapshot taken yesterday then un-greys the tile
// at midnight without asking anyone, and a fresh answer agrees with the
// server whenever the two clocks agree on the date — which they do, because
// the till stands in the store. The verdict alone is the fallback for a
// snapshot old enough to carry no day.

import type { CatalogItem } from '@pos/platform';

/** `YYYY-MM-DD` of `at` in the device's own zone. */
export function deviceLocalDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(at);
}

export function isStopListed(
  item: Pick<CatalogItem, 'stop_listed' | 'stop_listed_on'>,
  today: string = deviceLocalDay()
): boolean {
  if (item.stop_listed_on != null) return item.stop_listed_on === today;
  return item.stop_listed === true;
}
