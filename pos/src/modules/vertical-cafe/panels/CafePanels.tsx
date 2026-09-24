// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The café's figures on the owner's «Сьогодні» (TechDocs/POS_CAFE.md §10 К6).
 *
 * Four numbers worth a daily glance, and a fifth only where there are tables:
 *
 *  - **Food cost** — the one figure a kitchen lives or dies by, and the only
 *    one the sales totals above cannot show.
 *  - **Середній чек** — whether the counter is upselling or just ringing.
 *  - **Пік замовлень** — the hour to staff for.
 *  - **Найчастіша відповідь** — which modifier the menu is really selling; a
 *    café pouring oat milk all day has a menu question to rethink.
 *  - **Середній чек на стіл** — only when `tables` came back, because a
 *    counter-service café has none and «0» would read as a bad day rather
 *    than as a question that is not about it.
 *
 * The window is the host's: the dashboard defaults to today and the owner's
 * «30 днів» preset moves these with it.
 *
 * On any failure this renders NOTHING — including the 409 a store that is not
 * a café gets. A broken panel on the shop's main screen is worse than an
 * absent one, and `/admin/cafe` is where a failure gets explained in words.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coffee } from '@pos/platform/ui';
import { formatUah } from '@pos/platform';
import type { AnalyticsPanelProps } from '@pos/platform';
import { Stat } from '../ui/Stat';
import { getCafeAnalytics } from '../analytics/cafeAnalyticsApi';
import type { CafeAnalytics } from '../analytics/types';
import { formatHour, pct, peakHour, topModifier } from '../lib/figures';

export default function CafePanels({ from, to }: AnalyticsPanelProps) {
  const [data, setData] = useState<CafeAnalytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getCafeAnalytics({ from, to })
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [from, to]);

  if (failed) return null;

  const peak = data ? peakHour(data.peak_hours) : null;
  const modifier = data ? topModifier(data.top_modifiers) : null;
  const blind = data?.food_cost.unpriced_lines ?? 0;
  const tables = data?.tables ?? null;

  return (
    <section
      className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm"
      data-testid="cafe-panels"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="sq-section-label flex items-center gap-2">
          <Coffee size={24} className="text-sq-blue" />
          Кухня
        </p>
        <Link
          to="/admin/cafe"
          className="text-xs font-semibold text-sq-blue uppercase tracking-wide"
        >
          Докладніше
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Food cost"
          value={data ? pct(data.food_cost.bps) : '—'}
          // The honesty rule, on the dashboard: a share computed over half the
          // menu must not look like a share computed over all of it.
          hint={
            blind > 0
              ? `${blind} поз. без собівартості`
              : data
                ? 'за останніми цінами закупівлі'
                : undefined
          }
          tone={blind > 0 ? 'warn' : undefined}
          strong
          testId="cafe-panel-food-cost"
        />
        <Stat
          label="Середній чек"
          value={data?.average_check_cents != null ? formatUah(data.average_check_cents) : '—'}
          hint={data ? `${data.sales_count} чеків` : undefined}
          strong
          testId="cafe-panel-check"
        />
        <Stat
          label="Пік замовлень"
          value={peak ? formatHour(peak.hour) : '—'}
          hint={peak ? `${peak.orders} замовлень` : undefined}
          strong
          testId="cafe-panel-peak"
        />
        <Stat
          label="Найчастіша відповідь"
          value={modifier ? modifier.name : '—'}
          hint={modifier ? `${modifier.group_name} · ${modifier.times}×` : undefined}
          strong
          testId="cafe-panel-modifier"
        />
        {tables && (
          <Stat
            label="Середній чек на стіл"
            value={formatUah(tables.avg_bill_cents)}
            hint={
              tables.avg_minutes != null
                ? `${tables.bills} рахунків · ${tables.avg_minutes} хв`
                : `${tables.bills} рахунків`
            }
            strong
            testId="cafe-panel-table-check"
          />
        )}
      </div>
    </section>
  );
}
