// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Three figures on the owner's «Сьогодні» — the host's `analytics.Panels`
// slot (G3_DEBTS.md §4):
//
//  · **Видано під запис** — goods that left without money in the window. Not
//    takings: a single-tax payer on the cash method has no income until the
//    money comes (ПКУ, ст. 292), and the dashboard's «Виторг» above never
//    counts it.
//  · **Погашено** — the repayments. These ARE in «Виторг» already, as the
//    ordinary sales they are; this tile only says how much of it was debt.
//  · **Борг на кінець** — what all customers owed when the window closed, and
//    how many of them.
//
// The window is the dashboard's. Any failure draws nothing at all: a broken
// tile on the shop's main screen is worse than none, and «Борги» is where a
// problem gets explained.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah } from '@pos/platform';
import type { AnalyticsPanelProps } from '@pos/platform';
import { Wallet } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import { plural } from '../lib/debt';
import type { DebtSummary } from '../lib/types';

// The dashboard's own tile (grey, no shadow), as «Квіти» and «Кухня» draw it:
// a module's figures sit under the host's and must not look like a second app.
function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <div className="rounded-xl bg-sq-sidebar px-4 py-3.5" data-testid={testId}>
      <p className="text-[13px] font-medium text-sq-secondary">{label}</p>
      <p className="mt-1 text-[22px] leading-tight font-bold text-sq-heading tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-sq-muted">{hint}</p>}
    </div>
  );
}

export default function DebtPanels({ from, to }: AnalyticsPanelProps) {
  const [data, setData] = useState<DebtSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    debtsApi
      .summary(from, to)
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

  return (
    <section data-testid="debt-panels">
      <div className="flex items-center justify-between gap-3 pb-1.5 mb-3 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-sq-blue">
          <Wallet size={24} />
          Під запис
        </h3>
        <Link to="/admin/debts" className="text-[15px] font-semibold text-sq-blue hover:underline">
          Борги
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile
          label="Видано під запис"
          value={data ? formatUah(data.issued_cents) : '—'}
          hint={data && data.returned_cents > 0 ? `повернуто товару на ${formatUah(data.returned_cents)}` : undefined}
          testId="panel-debt-issued"
        />
        <Tile
          label="Погашено"
          value={data ? formatUah(data.repaid_cents) : '—'}
          hint={data && data.written_off_cents > 0 ? `списано ${formatUah(data.written_off_cents)}` : undefined}
          testId="panel-debt-repaid"
        />
        <Tile
          label="Борг на кінець"
          value={data ? formatUah(data.balance_end_cents) : '—'}
          hint={
            data
              ? `${data.debtors_end} ${plural(data.debtors_end, 'покупець', 'покупці', 'покупців')}`
              : undefined
          }
          testId="panel-debt-balance"
        />
      </div>
    </section>
  );
}
