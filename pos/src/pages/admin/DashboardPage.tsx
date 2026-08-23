import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { formatUah } from '../../lib/money';
import { toCsv, downloadCsv } from '../../lib/csv';
import type { SalesSummary } from '../../types';

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
}

const PAYMENT_LABEL_UK: Record<'cash' | 'card', string> = {
  cash: 'Готівка',
  card: 'Картка',
};

function buildSummaryCsv(data: SalesSummary): string {
  const money = (c: number) => (c / 100).toFixed(2);
  const totalPay = data.payments.reduce((s, p) => s + p.amount_cents, 0);

  const rows: (string | number)[][] = [
    ['Період', `${data.from} — ${data.to}`],
    [],
    ['Показник', 'Значення'],
    ['Продажі', data.sales_count],
    ['Загальний продаж', money(data.gross_cents)],
    ['Чистий дохід', money(data.net_cents)],
    ['Повернення', money(data.refunded_cents)],
    ['Середній чек', money(data.avg_check_cents)],
    [],
    ['Оплата', 'Сума', '% від суми оплат'],
    ...data.payments.map((p) => [
      PAYMENT_LABEL_UK[p.method],
      money(p.amount_cents),
      totalPay > 0 ? ((p.amount_cents / totalPay) * 100).toFixed(1) : '0',
    ]),
    [],
    ['Дата', 'Загальний продаж', 'Чистий дохід', 'Продажі'],
    ...data.daily.map((d) => [d.date, money(d.gross_cents), money(d.net_cents), d.sales_count]),
    [],
    ['Товар', 'Варіант', 'К-сть', 'Виручка'],
    ...data.top_items.map((i) => [i.product_name, i.variant_label || '—', i.qty_sold, money(i.revenue_cents)]),
  ];
  return toCsv(rows);
}

export function DashboardPage() {
  const [data, setData] = useState<SalesSummary | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load(nextFrom?: string, nextTo?: string) {
    setError(null);
    try {
      const summary = await api.salesSummary({ from: nextFrom, to: nextTo });
      setData(summary);
      setFrom(summary.from);
      setTo(summary.to);
    } catch {
      setError('Не вдалося завантажити аналітику');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(preset: 'today' | '7d' | '30d' | 'month') {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'today') void load(today, today);
    else if (preset === '7d') void load(addDays(today, -6), today);
    else if (preset === '30d') void load(addDays(today, -29), today);
    else void load(startOfMonth(today), today);
  }

  function exportCsv() {
    if (!data) return;
    const filename = `sales-summary_${data.from}${data.from !== data.to ? `_${data.to}` : ''}.csv`;
    downloadCsv(filename, buildSummaryCsv(data));
  }

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-sq-secondary text-sm">Завантаження…</p>;

  const metrics = [
    { label: 'Загальний продаж', value: formatUah(data.gross_cents) },
    { label: 'Продажі', value: String(data.sales_count) },
    { label: 'Середній чек', value: formatUah(data.avg_check_cents) },
    { label: 'Повернення', value: formatUah(data.refunded_cents) },
  ];

  const cashCents = data.payments.find((p) => p.method === 'cash')?.amount_cents ?? 0;
  const cardCents = data.payments.find((p) => p.method === 'card')?.amount_cents ?? 0;
  const totalPayCents = cashCents + cardCents;
  const maxDaily = Math.max(...data.daily.map((d) => d.net_cents), 1);
  const invalidRange = from > to;

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl text-sq-text">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Звіти з продажів</h2>
          <p className="text-sq-secondary text-sm mt-1">
            {data.from === data.to ? data.from : `${data.from} — ${data.to}`}
          </p>
        </div>
        <button type="button" onClick={exportCsv} className="sq-btn-primary px-4 py-2 text-sm">
          Експортувати CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <button type="button" onClick={() => applyPreset('today')} className="text-sm border border-sq-divider rounded-sq px-3 py-2 hover:bg-sq-bg">
          Сьогодні
        </button>
        <button type="button" onClick={() => applyPreset('7d')} className="text-sm border border-sq-divider rounded-sq px-3 py-2 hover:bg-sq-bg">
          7 днів
        </button>
        <button type="button" onClick={() => applyPreset('30d')} className="text-sm border border-sq-divider rounded-sq px-3 py-2 hover:bg-sq-bg">
          30 днів
        </button>
        <button type="button" onClick={() => applyPreset('month')} className="text-sm border border-sq-divider rounded-sq px-3 py-2 hover:bg-sq-bg">
          Цей місяць
        </button>

        <label className="text-sm space-y-1 ml-2">
          <span className="text-sq-secondary block">Від</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-sq-secondary block">До</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={invalidRange}
          onClick={() => void load(from, to)}
          className="sq-btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
        >
          Показати
        </button>
      </div>
      {invalidRange && <p className="text-sm text-red-600">«Від» не може бути пізніше «До»</p>}

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="sq-section-label">Загальний огляд продажів</p>
          <span className="text-xs font-semibold text-sq-blue uppercase tracking-wide">
            Чистий дохід {formatUah(data.net_cents)}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-3xl font-bold text-sq-text tracking-tight">{m.value}</p>
              <p className="text-xs text-sq-secondary mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <p className="sq-section-label mb-4">Дохід за днями</p>
        {data.daily.length === 0 ? (
          <p className="text-sm text-sq-secondary">Немає даних за період.</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {data.daily.map((d) => {
              const pct = Math.max((d.net_cents / maxDaily) * 100, d.net_cents > 0 ? 2 : 0);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end h-32">
                    <div
                      className="w-full bg-sq-blue rounded-t-sm"
                      style={{ height: `${pct}%` }}
                      title={`${d.date}: чистий ${formatUah(d.net_cents)}, продажів ${d.sales_count}`}
                    />
                  </div>
                  <p className="text-[10px] text-sq-secondary truncate w-full text-center">{d.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <p className="sq-section-label mb-4">Оплата</p>
        {totalPayCents === 0 ? (
          <p className="text-sm text-sq-secondary">Немає оплат за період.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-2 rounded-full overflow-hidden">
              <div className="bg-sq-blue" style={{ flexBasis: `${(cardCents / totalPayCents) * 100}%` }} />
              <div className="bg-sq-text/70" style={{ flexBasis: `${(cashCents / totalPayCents) * 100}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-2xl font-bold text-sq-text tracking-tight">{formatUah(cardCents)}</p>
                <p className="text-xs text-sq-secondary mt-1">
                  Картка · {((cardCents / totalPayCents) * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-sq-text tracking-tight">{formatUah(cashCents)}</p>
                <p className="text-xs text-sq-secondary mt-1">
                  Готівка · {((cashCents / totalPayCents) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <p className="sq-section-label mb-4">Популярні товари</p>
        {data.top_items.length === 0 ? (
          <p className="text-sm text-sq-secondary">Поки немає продажів.</p>
        ) : (
          <ul className="divide-y divide-sq-divider">
            {data.top_items.map((item, idx) => (
              <li key={`${item.product_name}-${idx}`} className="py-3 flex justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-sq-text">{item.product_name}</p>
                  <p className="text-sq-secondary">{item.variant_label || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{item.qty_sold} шт</p>
                  <p className="text-sq-secondary">{formatUah(item.revenue_cents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
