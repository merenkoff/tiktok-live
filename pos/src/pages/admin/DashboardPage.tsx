// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl, useAuthStore } from '@pos/platform';
import { formatUah } from '../../lib/money';
import { toCsv, downloadCsv } from '../../lib/csv';
import { SlotBoundary } from '../../modules/SlotBoundary';
import { reportModuleEvent } from '../../modules/telemetry';
import { resolveAnalyticsPanels } from '../../modules/verticals';
import type { PaymentMethod, SalesSummary } from '../../types';
import { Check, DownloadLine, Star } from '../../platform/glyphs';
import { deviceDay, useAttention } from './attention';

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
}

const PAYMENT_LABEL_UK: Record<PaymentMethod, string> = {
  cash: 'Готівка',
  card: 'Картка',
  qr: 'QR-код',
};

// Stable display order; unknown methods fall to the end.
const PAYMENT_ORDER: PaymentMethod[] = ['card', 'cash', 'qr'];
const PAYMENT_BAR_COLORS = ['bg-sq-blue', 'bg-sq-success', 'bg-[#8A6CEF]', 'bg-sq-warning'];

function paymentLabel(method: string): string {
  return PAYMENT_LABEL_UK[method as PaymentMethod] ?? method;
}

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
      paymentLabel(p.method),
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

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

const PRESETS: Array<{ id: Preset; label: string; title: string }> = [
  { id: 'today', label: 'Сьогодні', title: 'Сьогодні' },
  { id: '7d', label: '7 днів', title: 'Останні 7 днів' },
  { id: '30d', label: '30 днів', title: 'Останні 30 днів' },
  { id: 'month', label: 'Місяць', title: 'Цей місяць' },
  { id: 'custom', label: 'Період', title: 'Період' },
];

/** «четвер, 24 вересня» for one day, «1 — 24 вересня» for a window. */
function periodLabel(from: string, to: string): string {
  const at = (d: string) => new Date(`${d}T12:00:00`);
  if (from === to) {
    return new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }).format(at(from));
  }
  const day = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });
  return `${day.format(at(from))} — ${day.format(at(to))}`;
}

export function DashboardPage() {
  const [data, setData] = useState<SalesSummary | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<Preset>('today');
  const [error, setError] = useState<string | null>(null);

  const auth = useAuthStore((s) => s.auth);
  const vertical = auth?.store.vertical?.id ?? 'clothing';
  const fiscalEnabled = Boolean(auth?.store.fiscal?.enabled);
  const panels = useMemo(() => resolveAnalyticsPanels(vertical), [vertical]);
  const attention = useAttention((s) => s.items);

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
    // The owner opened «Сьогодні» to see what needs doing: always a fresh read.
    void useAttention.getState().load({ vertical, fiscalEnabled }, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === 'custom') return;
    const today = deviceDay();
    if (next === 'today') void load(today, today);
    else if (next === '7d') void load(addDays(today, -6), today);
    else if (next === '30d') void load(addDays(today, -29), today);
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
    { label: 'Виторг', value: formatUah(data.gross_cents) },
    { label: 'Чеків', value: String(data.sales_count) },
    { label: 'Середній чек', value: formatUah(data.avg_check_cents) },
    { label: 'Повернення', value: formatUah(data.refunded_cents) },
  ];

  const totalPayCents = data.payments.reduce((s, p) => s + p.amount_cents, 0);
  const paymentBreakdown = [...data.payments]
    .sort((a, b) => {
      const ai = PAYMENT_ORDER.indexOf(a.method);
      const bi = PAYMENT_ORDER.indexOf(b.method);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b.amount_cents - a.amount_cents;
    })
    .map((p, i) => ({
      method: p.method,
      label: paymentLabel(p.method),
      amount_cents: p.amount_cents,
      unconfirmed_cents: p.unconfirmed_cents ?? 0,
      pct: totalPayCents > 0 ? (p.amount_cents / totalPayCents) * 100 : 0,
      color: PAYMENT_BAR_COLORS[i % PAYMENT_BAR_COLORS.length],
    }));
  const maxDaily = Math.max(...data.daily.map((d) => d.net_cents), 1);
  const invalidRange = from > to;
  const title = PRESETS.find((p) => p.id === preset)?.title ?? 'Сьогодні';

  return (
    <div className="space-y-7 animate-fade-up max-w-4xl text-sq-text">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Star size={32} />
          <h2 className="text-[30px] font-bold text-sq-heading leading-tight">{title}</h2>
          <span className="ml-auto text-[15px] text-sq-muted" data-testid="dashboard-period">
            {periodLabel(data.from, data.to)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty" role="group" aria-label="Період">
            {PRESETS.map((p) => {
              const on = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => applyPreset(p.id)}
                  className={`min-h-[34px] px-3.5 rounded-[9px] text-[15px] transition-colors ${
                    on
                      ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                      : 'font-medium text-sq-secondary hover:text-sq-text'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Від"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-[10px] bg-sq-empty px-3 text-[15px] border-0"
              />
              <span className="text-sq-muted">—</span>
              <input
                type="date"
                aria-label="До"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-[10px] bg-sq-empty px-3 text-[15px] border-0"
              />
              <button
                type="button"
                disabled={invalidRange}
                onClick={() => void load(from, to)}
                className="pos-btn-primary h-9 px-4 rounded-[10px] text-[15px] disabled:opacity-50"
              >
                Показати
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="ml-auto h-9 px-3.5 rounded-[10px] bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text inline-flex items-center gap-2 hover:bg-sq-sidebar"
          >
            <DownloadLine size={20} />
            CSV
          </button>
        </div>
        {invalidRange && <p className="text-sm text-red-600">«Від» не може бути пізніше «До»</p>}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" data-testid="dashboard-stats">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl bg-sq-sidebar px-[18px] py-4 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sq-secondary">{m.label}</span>
            <span className="text-[26px] font-bold text-sq-heading tabular-nums leading-tight">{m.value}</span>
          </div>
        ))}
      </div>
      {data.net_cents !== data.gross_cents && (
        <p className="-mt-4 text-[13px] text-sq-muted tabular-nums">Чистий дохід {formatUah(data.net_cents)}</p>
      )}

      <section data-testid="dashboard-attention">
        <SectionHead title="Потребують уваги" />
        {attention == null ? (
          <p className="py-3 text-sm text-sq-muted">Перевіряємо…</p>
        ) : attention.length === 0 ? (
          <p className="py-3 flex items-center gap-2 text-[15px] text-sq-secondary">
            <Check size={20} className="text-sq-success" />
            Усе гаразд — нічого не чекає
          </p>
        ) : (
          <ul>
            {attention.map((item) => {
              const Icon = item.glyph;
              const body = (
                <>
                  <Icon size={24} className="shrink-0" />
                  <span className={`flex-1 min-w-0 text-base ${item.alert ? 'text-sq-danger font-semibold' : 'text-sq-text'}`}>
                    {item.text}
                  </span>
                  {item.meta && <span className="text-sm text-sq-muted tabular-nums">{item.meta}</span>}
                  <span className="h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary inline-flex items-center shrink-0">
                    {item.tag}
                  </span>
                </>
              );
              return (
                <li key={item.key} className="shadow-[0_1px_0_#E6E8EC]">
                  {item.to ? (
                    <Link to={item.to} className="min-h-11 py-1.5 flex items-center gap-3 hover:bg-sq-sidebar/60 -mx-2 px-2 rounded-lg">
                      {body}
                    </Link>
                  ) : (
                    <div className="min-h-11 py-1.5 flex items-center gap-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* What the store's vertical adds to the owner's morning. Nothing at all
          for a clothing shop, and nothing when the module's CDN is down — the
          dashboard is the host's screen (TechDocs/POS_FLORIST_BENCH.md §15). */}
      {panels && (
        <SlotBoundary
          fallback={null}
          onError={(err) =>
            reportModuleEvent({
              type: 'analytics_panels_error',
              moduleId: panels.moduleId,
              vertical,
              error: err,
            })
          }
        >
          <Suspense fallback={<div className="h-28" />}>
            <panels.Panels from={data.from} to={data.to} />
          </Suspense>
        </SlotBoundary>
      )}

      {data.daily.length > 1 && (
        <section>
          <SectionHead title="Дохід за днями" />
          <div className="flex items-end gap-1 h-40 pt-3">
            {data.daily.map((d) => {
              const pct = Math.max((d.net_cents / maxDaily) * 100, d.net_cents > 0 ? 2 : 0);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end h-32">
                    <div
                      className="w-full bg-sq-blue rounded-t-[4px]"
                      style={{ height: `${pct}%` }}
                      title={`${d.date}: чистий ${formatUah(d.net_cents)}, продажів ${d.sales_count}`}
                    />
                  </div>
                  <p className="text-[10px] text-sq-muted truncate w-full text-center tabular-nums">{d.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Оплата" />
        {totalPayCents === 0 ? (
          <p className="py-3 text-sm text-sq-muted">Немає оплат за період.</p>
        ) : (
          <div className="space-y-3 pt-3">
            <div className="flex h-2 rounded-full overflow-hidden">
              {paymentBreakdown.map((p) => (
                <div key={p.method} className={p.color} style={{ flexBasis: `${p.pct}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {paymentBreakdown.map((p) => (
                <div key={p.method}>
                  <p className="text-[22px] font-bold text-sq-heading tabular-nums">{formatUah(p.amount_cents)}</p>
                  <p className="text-[13px] text-sq-secondary mt-0.5 flex items-center gap-1.5">
                    <span aria-hidden className={`w-2 h-2 rounded-full ${p.color}`} />
                    {p.label} · {p.pct.toFixed(0)}%
                  </p>
                  {p.unconfirmed_cents > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      не підтверджено {formatUah(p.unconfirmed_cents)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Популярні товари" />
        {data.top_items.length === 0 ? (
          <p className="py-3 text-sm text-sq-muted">Поки немає продажів.</p>
        ) : (
          <ul>
            {data.top_items.map((item, idx) => (
              <li
                key={`${item.product_name}-${idx}`}
                className="min-h-12 py-1.5 flex items-center gap-3 shadow-[0_1px_0_#E6E8EC]"
              >
                <Thumb url={item.image_url ?? null} />
                <span className="flex-1 min-w-0">
                  <span className="block text-base text-sq-text truncate">{item.product_name}</span>
                  {item.variant_label && (
                    <span className="block text-[13px] text-sq-muted truncate">{item.variant_label}</span>
                  )}
                </span>
                <span className="text-sm text-sq-muted tabular-nums shrink-0">{formatUah(item.revenue_cents)}</span>
                <span className="w-16 text-right text-sm font-semibold text-sq-text tabular-nums shrink-0">
                  {item.qty_sold} шт.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Things' section title: blue, bold, a hairline under it. */
function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between pb-1.5 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
      <h3 className="text-[15px] font-bold text-sq-blue">{title}</h3>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  const src = url ? assetUrl(url) : null;
  return (
    <span className="w-8 h-8 rounded-lg bg-sq-empty overflow-hidden shrink-0">
      {src && <img src={src} alt="" className="w-full h-full object-cover" />}
    </span>
  );
}
