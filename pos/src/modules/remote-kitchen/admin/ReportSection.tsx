// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддано на точки» (РК5, TechDocs/POS_REMOTE_KITCHEN.md §12): what the
// kitchen handed to each cafe over a day, a week or a month, by dish, and how
// many of its promises it kept. Read by a cafe, the same orders from its side
// — «Отримано з кухні». Paid orders only, counted on the day they were paid.

import { useEffect, useState } from 'react';
import { SectionHead } from '@pos/platform/ui';
import { serverMessage } from '../lib/hostPlatform';
import { readReport, type ReportRow } from './settingsApi';

const PERIODS = [
  { days: 1, label: 'Доба' },
  { days: 7, label: 'Тиждень' },
  { days: 30, label: 'Місяць' },
] as const;

/** «9 з 10 вчасно (90 %)», or nothing when nothing left the kitchen. */
function keptLine(row: Pick<ReportRow, 'orders' | 'on_time'>): string {
  if (row.orders === 0) return '';
  return `${row.on_time} з ${row.orders} вчасно (${Math.round((row.on_time / row.orders) * 100)} %)`;
}

export function ReportSection({ side }: { side: 'cafe' | 'kitchen' }): JSX.Element {
  const [days, setDays] = useState<number>(7);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    readReport(side, days)
      .then((answer) => {
        if (!live) return;
        setRows(answer);
        setError(null);
      })
      .catch((e) => {
        if (live) setError(serverMessage(e, 'Не вдалося прочитати звіт'));
      });
    return () => {
      live = false;
    };
  }, [side, days]);

  const title = side === 'kitchen' ? 'Віддано на точки' : 'Отримано з кухні';
  return (
    <section aria-label={title} className="space-y-3" data-testid={`rk-report-${side}`}>
      <SectionHead title={title} />
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={days === p.days}
            className={days === p.days ? 'sq-btn-primary' : 'sq-btn-quiet'}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[13px] text-sq-danger">{error}</p>}
      {rows === null && !error && <p className="text-[15px] text-sq-muted">Завантажую…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-[15px] text-sq-secondary">За цей час оплачених замовлень не було.</p>
      )}
      <ul className="space-y-4">
        {(rows ?? []).map((row) => (
          <li key={row.store_name} className="space-y-1">
            <p className="text-[15px] font-semibold">
              {row.store_name}
              <span className="font-normal text-sq-muted"> · {row.orders} замовлень</span>
            </p>
            {row.orders > 0 && (
              <p className="text-[13px] text-sq-secondary">
                {keptLine(row)}
                {row.delayed > 0 ? ` · переносили ${row.delayed}` : ''}
                {row.cancelled > 0 ? ` · скасовано ${row.cancelled}` : ''}
              </p>
            )}
            {row.orders === 0 && row.cancelled > 0 && (
              <p className="text-[13px] text-sq-secondary">Скасовано {row.cancelled}</p>
            )}
            {row.dishes.length > 0 && (
              <p className="text-[13px] text-sq-secondary">
                {row.dishes.map((d) => `${d.name} × ${d.quantity}`).join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
