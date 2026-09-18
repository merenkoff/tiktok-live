// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Three of the florist's figures on the owner's «Сьогодні»
 * (`TechDocs/POS_FLORIST_BENCH.md` §15, phase B8).
 *
 * §13 has nine or so numbers and a page to put them on. What belongs here is
 * only what is worth a daily glance:
 *
 *  - **У смітнику** — the one money the sales figures above cannot show, and
 *    the one a flower shop loses every single day.
 *  - **Букети у виручці** — whether the florist's work is where the money is,
 *    or the shop is selling stems by the piece.
 *  - **Націнка на букетах** — what survived the discounts, next to what the
 *    shop actually asks for assembly. §13.2: those two are the pair that is
 *    easiest to confuse, so they are only ever shown together.
 *
 * Deliberately not here: the write-off share against goods received (§13.2
 * calls it noise on a narrow window, and this dashboard defaults to *today*),
 * and the top-stems table, which is a table.
 *
 * The window is the host's, not ours — the dashboard defaults to today and the
 * owner's «30 днів» preset moves these with it, which is the right behaviour
 * and costs nothing.
 *
 * On any failure this renders nothing at all. A broken panel on the shop's main
 * screen is worse than an absent one, and the module's own page is where the
 * failure gets explained in words.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flower2 } from 'lucide-react';
import { api, formatUah } from '@pos/platform';
import type { AnalyticsPanelProps, FlowerAnalytics } from '@pos/platform';
import { Stat } from '../ui/Stat';
import { REASON_LABEL, bouquetRow, bouquetShareBps, leadingLossReason, pct } from '../lib/figures';

export default function FlowerPanels({ from, to }: AnalyticsPanelProps) {
  const [data, setData] = useState<FlowerAnalytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .getFlowerAnalytics({ from, to })
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        // Includes the 409 a store that does not sell flowers gets. Nothing is
        // drawn either way; `/admin/flowers` says why.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [from, to]);

  if (failed) return null;

  const bouquets = data ? bouquetRow(data.margin) : null;
  const shareBps = data ? bouquetShareBps(data.margin) : null;
  const leading = data ? leadingLossReason(data.loss) : null;

  return (
    <section
      className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm"
      data-testid="flower-panels"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="sq-section-label flex items-center gap-2">
          <Flower2 size={14} className="text-sq-blue" />
          Квіти
        </p>
        <Link
          to="/admin/flowers"
          className="text-xs font-semibold text-sq-blue uppercase tracking-wide"
        >
          Докладніше
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="У смітнику"
          value={data ? formatUah(data.loss.total_cost_cents) : '—'}
          hint={leading ? `здебільшого: ${REASON_LABEL[leading.reason].toLowerCase()}` : undefined}
          strong
          testId="panel-loss"
        />
        <Stat
          label="Букети у виручці"
          value={bouquets ? formatUah(bouquets.revenue_cents) : '—'}
          hint={shareBps != null ? `${pct(shareBps)} усіх продажів` : undefined}
          strong
          testId="panel-bouquet-revenue"
        />
        <Stat
          label="Націнка на букетах"
          value={bouquets ? pct(bouquets.markup_bps) : '—'}
          hint={data ? `магазин просить ${pct(data.margin.labour_bps)}` : undefined}
          strong
          testId="panel-bouquet-markup"
        />
      </div>
    </section>
  );
}
