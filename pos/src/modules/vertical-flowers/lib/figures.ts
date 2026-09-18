// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * How the florist's numbers are read out loud.
 *
 * Shared by the module's two analytics surfaces — the full page
 * (`/admin/flowers`) and the three tiles it contributes to «Сьогодні» — so a
 * percentage or a write-off reason cannot be worded one way on one screen and
 * another way on the other.
 */

import type { FlowerAnalytics, FlowerLossRow } from '@pos/platform';

export const REASON_LABEL: Record<FlowerLossRow['reason'], string> = {
  damaged: 'Завʼяло',
  gift: 'Подаровано',
  lost: 'Недостача',
  other: 'Інше',
};

/** Basis points as the percentage a person reads. 2000 → «20%», null → «—». */
export function pct(bps: number | null): string {
  if (bps == null) return '—';
  const value = bps / 100;
  // A whole number unless the fraction actually says something.
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** The reason that cost the most, or null when nothing was written off. */
export function leadingLossReason(loss: FlowerAnalytics['loss']): FlowerLossRow | null {
  let top: FlowerLossRow | null = null;
  for (const row of loss.by_reason) {
    if (row.cost_cents > 0 && (!top || row.cost_cents > top.cost_cents)) top = row;
  }
  return top;
}

/**
 * The bouquet row, which is absent on a day the shop sold only loose stems.
 * Absent is an answer — «сьогодні букетів не було» — so callers show «—»
 * rather than hiding the figure.
 */
export function bouquetRow(margin: FlowerAnalytics['margin']): FlowerAnalytics['margin']['rows'][number] | null {
  return margin.rows.find((r) => r.kind === 'bouquet') ?? null;
}

/** Bouquets' share of takings, in basis points. Null when nothing was sold. */
export function bouquetShareBps(margin: FlowerAnalytics['margin']): number | null {
  const bouquets = bouquetRow(margin);
  if (!bouquets || margin.total_revenue_cents <= 0) return null;
  return Math.round((bouquets.revenue_cents / margin.total_revenue_cents) * 10_000);
}
