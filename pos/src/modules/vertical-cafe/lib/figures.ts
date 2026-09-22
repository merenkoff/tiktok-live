// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers behind the café's two analytics surfaces (phase К6). Pinned by
// `figures.test.ts`; nothing here touches React or the network.

import type { CafeAnalytics, MenuQuadrant } from '../analytics/types';

/** A percentage from basis points, or «—» — never a confident 0 % from null. */
export function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value / 100).toFixed(1).replace('.', ',')} %`;
}

/** «13:00» — the hour the counter is busiest, written the way a clock is. */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * The busiest hour of the day, or null when nothing was sold.
 *
 * Null rather than hour 0: an empty day would otherwise read as «пік о 00:00»,
 * which is a claim about the night shift rather than about an empty day. Ties
 * go to the earlier hour — the morning rush is the one a café staffs for.
 */
export function peakHour(
  hours: CafeAnalytics['peak_hours']
): { hour: number; orders: number } | null {
  let best: { hour: number; orders: number } | null = null;
  for (const row of hours) {
    if (row.orders <= 0) continue;
    if (!best || row.orders > best.orders) best = { hour: row.hour, orders: row.orders };
  }
  return best;
}

/** The answer the counter hears most often, or null. Already sorted by the server. */
export function topModifier(
  list: CafeAnalytics['top_modifiers']
): CafeAnalytics['top_modifiers'][number] | null {
  return list[0] ?? null;
}

/** What each quadrant is called, and — the point of the screen — what to do. */
export const QUADRANT: Record<MenuQuadrant, { title: string; advice: string }> = {
  star: { title: 'Зірки', advice: 'тримати як є' },
  plowhorse: { title: 'Робочі конячки', advice: 'беруть часто, а заробляють мало — підняти ціну' },
  puzzle: { title: 'Загадки', advice: 'заробляють добре, беруть рідко — рекламувати' },
  dog: { title: 'Собаки', advice: 'ні популярності, ні маржі — прибрати з меню' },
};

/** The four quadrants in the order an owner should read them. */
export const QUADRANT_ORDER: MenuQuadrant[] = ['star', 'plowhorse', 'puzzle', 'dog'];

/** Why a dish is out of the matrix, in the owner's words — never a silent «dog». */
export const EXCLUSION_LABEL: Record<CafeAnalytics['menu']['excluded'][number]['reason'], string> =
  {
    no_cost: 'не вистачає собівартості складника',
    no_price: 'продано без ціни',
  };
