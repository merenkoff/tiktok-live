// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддано на точки» (РК5, TechDocs/POS_REMOTE_KITCHEN.md §12): what the
// kitchen handed to each cafe today, over 7 or 30 days of the store's
// calendar, by dish and size, what it cost the kitchen, and how many of its
// promises it kept. Read by a cafe, the same orders from its side — «Отримано
// з кухні». Paid orders only, counted on the day they were paid.

import { useEffect, useState } from 'react';
import { formatUah } from '@pos/platform';
import { SectionHead } from '@pos/platform/ui';
import { serverMessage } from '../lib/hostPlatform';
import { readReport, type ReportRow } from './settingsApi';

/** Days of the store's calendar, today included: «Сьогодні» is today, not the last 24 hours. */
const PERIODS = [
  { days: 1, label: 'Сьогодні' },
  { days: 7, label: '7 днів' },
  { days: 30, label: '30 днів' },
] as const;

function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

/** «9 з 10 вчасно (90 %)» — by the time the guest was told; nothing when nothing reached the cafe. */
function keptLine(row: Pick<ReportRow, 'orders' | 'on_time'>): string {
  if (row.orders === 0) return '';
  return `${row.on_time} з ${row.orders} вчасно (${percent(row.on_time, row.orders)} %)`;
}

/** «переносили 2, з переносом вчасно 10» — what «+N хв» bought. */
function delayedLine(row: ReportRow): string {
  if (row.delayed <= 0) return '';
  const moved = row.on_time_moved;
  return moved != null && moved > row.on_time
    ? `переносили ${row.delayed}, з переносом вчасно ${moved}`
    : `переносили ${row.delayed}`;
}

/** «скасувала кухня 1, кафе 2»; an older server says only the total. */
function cancelledLine(row: ReportRow): string {
  if (row.cancelled <= 0) return '';
  if (row.cancelled_kitchen == null) return `скасовано ${row.cancelled}`;
  const byCafe = row.cancelled - row.cancelled_kitchen;
  const parts = [
    row.cancelled_kitchen > 0 ? `кухня ${row.cancelled_kitchen}` : '',
    byCafe > 0 ? `кафе ${byCafe}` : '',
  ].filter(Boolean);
  return `скасувала ${parts.join(', ')}`;
}

/** The row's title, with the address when another row bears the same name. */
function titleOf(row: ReportRow, rows: ReportRow[]): string {
  const twins = rows.filter((r) => r.store_name === row.store_name).length > 1;
  if (!twins) return row.store_name;
  return row.store_address ? `${row.store_name} (${row.store_address})` : `${row.store_name} (№ ${row.store_id})`;
}

function dishText(d: ReportRow['dishes'][number]): string {
  return `${d.name}${d.label ? ` ${d.label}` : ''} × ${d.quantity}`;
}

export function ReportSection({ side }: { side: 'cafe' | 'kitchen' }): JSX.Element {
  const [days, setDays] = useState<number>(7);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    readReport(side, days)
      .then((answer) => {
        if (live) setRows(answer);
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
        {(rows ?? []).map((row) => {
          const facts = [keptLine(row), delayedLine(row), cancelledLine(row)].filter(Boolean);
          return (
            <li key={row.store_id ?? row.store_name} className="space-y-1" data-testid={`rk-report-row-${row.store_id}`}>
              <p className="text-[15px] font-semibold">
                {titleOf(row, rows ?? [])}
                <span className="font-normal text-sq-muted"> · {row.orders} замовлень</span>
              </p>
              {facts.length > 0 && <p className="text-[13px] text-sq-secondary">{facts.join(' · ')}</p>}
              {row.cost_cents != null && (row.cost_cents > 0 || (row.unpriced_lines ?? 0) > 0) && (
                <p className="text-[13px] text-sq-secondary">
                  Собівартість {formatUah(row.cost_cents)} — за сьогоднішніми цінами закупівлі
                  {(row.unpriced_lines ?? 0) > 0 ? ` · без ціни закупівлі: ${row.unpriced_lines} поз., не пораховано` : ''}
                </p>
              )}
              {row.dishes.length > 0 && (
                <p className="text-[13px] text-sq-secondary">{row.dishes.map(dishText).join(', ')}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
