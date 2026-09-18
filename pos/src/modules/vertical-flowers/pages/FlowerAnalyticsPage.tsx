// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The florist's own numbers, in the admin (`TechDocs/POS_FLORIST_BENCH.md` §13).
 *
 * A page owned by the flowers module rather than panels bolted onto «Сьогодні»,
 * for the same reason `tiktok-live` owns `/admin/live`: the module's own
 * surface, appearing only in a shop that has the module, and gone when it does
 * not — with no way for a CDN outage to take the core dashboard down with it.
 *
 * Owner-only by construction: `renderRoutes` wraps every `/admin` route in
 * `<Guard ownerOnly>`, so nothing here re-checks the role.
 *
 * Three questions, in the order a florist asks them: what died, what actually
 * sells, and whether the work was paid for.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flower2, Scissors, TrendingUp, Trash2 } from 'lucide-react';
import { api, formatUah } from '@pos/platform';
import type { FlowerAnalytics } from '@pos/platform';
// Shared with the «Сьогодні» panels, so a reason or a percentage cannot be
// worded one way on one screen and another way on the other.
import { REASON_LABEL, pct } from '../lib/figures';
import { Stat } from '../ui/Stat';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const RANGES = [
  { days: 7, label: 'Тиждень' },
  { days: 30, label: 'Місяць' },
  { days: 90, label: 'Квартал' },
];

export default function FlowerAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FlowerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forDays: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getFlowerAnalytics({ from: isoDaysAgo(forDays - 1) }));
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(
        sent === 'not_a_flower_shop'
          ? 'Цей магазин не продає квіти'
          : 'Не вдалося завантажити аналітику'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const bouquets = useMemo(
    () => data?.margin.rows.find((row) => row.kind === 'bouquet') ?? null,
    [data]
  );
  const peakLoss = useMemo(
    () => Math.max(1, ...(data?.daily_loss.map((d) => d.cost_cents) ?? [0])),
    [data]
  );

  return (
    <div className="p-4 md:p-6 space-y-6" data-testid="flower-analytics">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sq-text flex items-center gap-2">
            <Flower2 size={22} className="text-sq-blue" />
            Квіти
          </h1>
          <p className="text-sm text-sq-muted mt-0.5">
            Що завʼяло, що справді йде і чи заробила робота флориста.
          </p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Період">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDays(range.days)}
              className={`min-h-10 px-3 rounded-sq text-sm font-semibold ${
                days === range.days
                  ? 'bg-sq-blue text-white'
                  : 'bg-sq-bg text-sq-secondary hover:text-sq-text'
              }`}
              data-testid={`range-${range.days}`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>

      {loading && <p className="text-sm text-sq-muted">Рахуємо…</p>}
      {error && (
        <p className="text-sm text-red-600" data-testid="flower-analytics-error">
          {error}
        </p>
      )}

      {data && !loading && !error && (
        <>
          {/* ── Що в смітнику ─────────────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <Trash2 size={18} className="text-sq-secondary" />У смітнику
            </h2>

            <p className="mt-2 text-2xl font-semibold text-sq-text" data-testid="loss-total">
              {formatUah(data.loss.total_cost_cents)}
            </p>
            <p className="text-xs text-sq-muted">за собівартістю, {data.from} — {data.to}</p>

            {data.loss.by_reason.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.loss.by_reason.map((row) => (
                  <span
                    key={row.reason}
                    className="text-xs px-2 py-1 rounded-[3px] bg-sq-bg text-sq-secondary"
                  >
                    {REASON_LABEL[row.reason]}: {formatUah(row.cost_cents)} ({row.quantity})
                  </span>
                ))}
              </div>
            )}

            {/* One line worth drawing: a spike says a delivery sat too long. */}
            <div className="mt-4 flex items-end gap-[2px] h-16" aria-hidden="true">
              {data.daily_loss.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${formatUah(day.cost_cents)}`}
                  className="flex-1 bg-sq-blue/20 rounded-t-[2px] min-h-[2px]"
                  style={{ height: `${Math.round((day.cost_cents / peakLoss) * 100)}%` }}
                />
              ))}
            </div>

            {data.loss.top_variants.length === 0 ? (
              <p className="mt-4 text-sm text-sq-muted">За цей період нічого не списували.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead className="text-xs text-sq-muted">
                  <tr className="text-left">
                    <th className="font-normal pb-1">Позиція</th>
                    <th className="font-normal pb-1 text-right">Списано</th>
                    <th className="font-normal pb-1 text-right">Прийшло</th>
                    <th className="font-normal pb-1 text-right">Частка</th>
                    <th className="font-normal pb-1 text-right">Собівартість</th>
                  </tr>
                </thead>
                <tbody>
                  {data.loss.top_variants.map((row) => (
                    <tr key={row.variant_id} className="border-t border-sq-divider">
                      <td className="py-1.5">
                        {row.product_name}
                        {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {row.written_off} {row.unit}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">
                        {row.received || '—'}
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums font-semibold ${
                          (row.waste_bps ?? 0) >= 2000 ? 'text-red-600' : 'text-sq-text'
                        }`}
                      >
                        {pct(row.waste_bps)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatUah(row.cost_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-sq-muted">
              «Частка» — списано проти того, що прийшло за цей самий період. Магазин не веде
              партій, тож це орієнтир для закупівлі, а не вік конкретного стебла.
            </p>
          </section>

          {/* ── Топ стебел ────────────────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <Scissors size={18} className="text-sq-secondary" />
              Що справді йде
            </h2>
            <p className="mt-1 text-xs text-sq-muted">
              Разом із тим, що пішло всередині букетів — цього не видно у звичайному топі
              товарів, бо там рахуються картки букетів, а не стебла.
            </p>

            {data.stems.length === 0 ? (
              <p className="mt-4 text-sm text-sq-muted">За цей період нічого не продали.</p>
            ) : (
              <table className="mt-3 w-full text-sm" data-testid="stem-table">
                <thead className="text-xs text-sq-muted">
                  <tr className="text-left">
                    <th className="font-normal pb-1">Позиція</th>
                    <th className="font-normal pb-1 text-right">Поштучно</th>
                    <th className="font-normal pb-1 text-right">У букетах</th>
                    <th className="font-normal pb-1 text-right">Разом</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stems.map((row) => (
                    <tr key={row.variant_id} className="border-t border-sq-divider">
                      <td className="py-1.5">
                        {row.product_name}
                        {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">{row.loose}</td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">
                        {row.in_bouquets}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">
                        {row.total} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── Реалізована націнка ───────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <TrendingUp size={18} className="text-sq-secondary" />
              Реалізована націнка
            </h2>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Виторг" value={formatUah(data.margin.total_revenue_cents)} />
              <Stat label="Собівартість" value={formatUah(data.margin.total_cost_cents)} />
              <Stat label="Заробіток" value={formatUah(data.margin.total_margin_cents)} strong />
            </div>

            {bouquets && (
              <p className="mt-4 text-sm text-sq-text" data-testid="bouquet-markup">
                На букетах — <strong>{pct(bouquets.markup_bps)}</strong> націнки на собівартість
                стебел, {bouquets.lines}{' '}
                {bouquets.lines === 1 ? 'рядок' : bouquets.lines < 5 ? 'рядки' : 'рядків'}.
              </p>
            )}
            <p className="mt-1 text-xs text-sq-muted">
              Магазин просить <strong>{pct(data.margin.labour_bps)}</strong> за збирання поверх
              роздрібної ціни стебел. Цифра вище — те, що лишилося після знижок, і рахується вона
              від собівартості, тож більша за неї.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
