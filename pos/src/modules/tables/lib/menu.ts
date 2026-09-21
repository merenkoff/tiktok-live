// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the dish picker shows (phase К4f), as pure arithmetic.
//
// The waiter picks a DISH, not a variant: «Лате» is one row, and which size
// it is becomes the first question on the sheet — exactly as a tap on the
// café tile behaves (`CafeCatalog`, POS_CAFE.md §3). So the flat catalogue
// the host hands back is folded back into products here.

import type { CatalogItem } from '@pos/platform';

/** One row of the picker: a dish, with every variant it comes in. */
export interface MenuProduct {
  product_id: number;
  name: string;
  variants: CatalogItem[];
  /** The cheapest variant — what «від 65 ₴» reads off. */
  from_cents: number;
  /** Everything on the shelf across the variants. 0 greys the row. */
  stock: number;
  /** Pulled for the day on the kitchen board (К3). */
  stopped: boolean;
}

/** `YYYY-MM-DD` of `at` in the device's own zone. */
export function deviceLocalDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(at);
}

/**
 * «Сьогодні не робимо», read the way the café till reads it.
 *
 * The day is compared on the device's clock rather than trusting the
 * server's verdict, so a mirror snapshotted yesterday un-greys the row at
 * midnight without asking anyone; the verdict alone is the fallback for an
 * answer old enough to carry no day. Three lines rather than an import from
 * `vertical-cafe`: the two modules are built and released separately, and
 * sharing a file would bake one bundle into the other.
 */
export function stopListedToday(
  item: Pick<CatalogItem, 'stop_listed' | 'stop_listed_on'>,
  today: string = deviceLocalDay()
): boolean {
  if (item.stop_listed_on != null) return item.stop_listed_on === today;
  return item.stop_listed === true;
}

/**
 * Fold the catalogue into dishes, keeping the order the server sent.
 *
 * That order is the menu's own (tag, then name), and re-sorting it here would
 * put «Американо» above «Лате» on a screen whose whole job is to be scanned
 * in one glance.
 */
export function groupMenu(
  items: readonly CatalogItem[],
  today: string = deviceLocalDay()
): MenuProduct[] {
  const byProduct = new Map<number, MenuProduct>();
  for (const item of items) {
    const row = byProduct.get(item.product_id);
    if (row) {
      row.variants.push(item);
      row.from_cents = Math.min(row.from_cents, item.price_cents);
      row.stock += item.quantity;
      continue;
    }
    byProduct.set(item.product_id, {
      product_id: item.product_id,
      name: item.product_name,
      variants: [item],
      from_cents: item.price_cents,
      stock: item.quantity,
      // Per product, not per variant: the board stops a dish, and its sizes
      // go with it.
      stopped: stopListedToday(item, today),
    });
  }
  return [...byProduct.values()];
}

/** What the row says under the dish name, or '' when it has nothing to add. */
export function menuSubtitle(row: MenuProduct): string {
  const parts: string[] = [];
  if (row.variants.length > 1) parts.push(`${row.variants.length} розміри`);
  else if (row.variants[0]?.label) parts.push(row.variants[0].label);
  if (row.stopped) parts.push('сьогодні не робимо');
  else if (row.stock <= 0) parts.push('немає');
  return parts.join(' · ');
}
