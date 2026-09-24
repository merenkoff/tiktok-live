// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The café's own screen in the admin (`TechDocs/POS_CAFE.md` §10, phase К6).
 *
 * The design doc's premise, written out: a report says what happened, this
 * screen says what to do about it. The menu matrix (Kasavana–Smith) is the
 * whole point — four quadrants, each with the one sentence an owner acts on:
 * keep it, raise the price, advertise it, take it off.
 *
 * Owned by the module rather than bolted onto «Сьогодні», for the reason
 * `/admin/flowers` gives: it exists only in a store that has the module, and a
 * CDN outage cannot take the core dashboard with it. Owner-only by
 * construction — `renderRoutes` wraps every `/admin` route in `<Guard
 * ownerOnly>`, so nothing here re-checks the role.
 *
 * Three honesty rules the screen is built around, all of them easy to get
 * backwards:
 *
 *  1. **Cost is today's purchase price, not what that batch cost.** Said out
 *     loud in the header, exactly as `/admin/tech-cards` says it. Otherwise a
 *     recalculated last month reads as a fact about last month.
 *  2. **A dish whose recipe has an unpriced leaf is not classified at all.**
 *     It is listed apart with the reason. Quietly dropping it among the dogs
 *     would have the owner cut a dish for a reason that is not true.
 *  3. **Too small a sample classifies nothing.** The figures still stand — they
 *     are arithmetic — but the four quadrants are withheld until there is
 *     enough to mean anything.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, LayoutGrid, Trash2, UtensilsCrossed } from '@pos/platform/ui';
import { formatUah, useVertical } from '@pos/platform';
import { Stat } from '../ui/Stat';
import { getCafeAnalytics } from '../analytics/cafeAnalyticsApi';
import type { CafeAnalytics } from '../analytics/types';
import {
  EXCLUSION_LABEL,
  QUADRANT,
  formatHour,
  formatMinutes,
  groupByQuadrant,
  pct,
  reasonLabeller,
} from '../lib/figures';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const RANGES = [
  { days: 7, label: 'Тиждень' },
  { days: 30, label: 'Місяць' },
  { days: 90, label: 'Квартал' },
];

/** The quadrant's colour — a badge, and the card's left edge. */
const TONE: Record<keyof typeof QUADRANT, string> = {
  star: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  plowhorse: 'text-sky-700 bg-sky-50 border-sky-200',
  puzzle: 'text-amber-700 bg-amber-50 border-amber-200',
  dog: 'text-red-700 bg-red-50 border-red-200',
};

export default function CafeAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CafeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const vertical = useVertical();
  const labelOfReason = useMemo(
    () => reasonLabeller(vertical.writeoffReasons),
    [vertical.writeoffReasons]
  );

  const load = useCallback(async (forDays: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCafeAnalytics({ from: isoDaysAgo(forDays - 1) }));
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(
        sent === 'not_a_cafe' ? 'Цей магазин не кафе' : 'Не вдалося завантажити аналітику'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const peak = useMemo(
    () => Math.max(1, ...(data?.peak_hours.map((h) => h.orders) ?? [0])),
    [data]
  );
  const groups = useMemo(() => (data ? groupByQuadrant(data.menu.rows) : []), [data]);
  const blind = data?.food_cost.unpriced_lines ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6" data-testid="cafe-analytics">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sq-text flex items-center gap-2">
            <ChefHat size={24} className="text-sq-blue" />
            Меню й кухня
          </h1>
          <p className="text-sm text-sq-muted mt-0.5">
            Що тримати в меню, що переписати цінником і що прибрати.
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
        <p className="text-sm text-red-600" data-testid="cafe-analytics-error">
          {error}
        </p>
      )}

      {data && !loading && !error && (
        <>
          {/* ── Скільки коштує кухня ──────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <UtensilsCrossed size={24} className="text-sq-secondary" />
              Скільки коштує те, що продали
            </h2>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Food cost"
                value={pct(data.food_cost.bps)}
                hint={blind > 0 ? `без ${blind} поз.` : undefined}
                tone={blind > 0 ? 'warn' : undefined}
                strong
                testId="cafe-food-cost"
              />
              <Stat label="Виторг" value={formatUah(data.food_cost.revenue_cents)} />
              <Stat label="Собівартість" value={formatUah(data.food_cost.cost_cents)} />
              <Stat
                label="Середній чек"
                value={
                  data.average_check_cents != null ? formatUah(data.average_check_cents) : '—'
                }
                hint={`${data.sales_count} чеків`}
                strong
                testId="cafe-average-check"
              />
            </div>

            {/* Rule 1, said out loud — the same sentence `/admin/tech-cards`
                uses, because it is the same arithmetic. */}
            <p className="mt-3 text-xs text-sq-muted">
              Собівартість — за останніми цінами закупівлі, а не за тими, що були в день продажу.
              Магазин не веде партій, тож це орієнтир для меню, а не історичний факт.
              {blind > 0 && (
                <>
                  {' '}
                  <span className="text-amber-600" data-testid="cafe-blind-lines">
                    {blind} проданих позицій у цей відсоток не входять — у їхньому рецепті є
                    складник без собівартості.
                  </span>
                </>
              )}
            </p>

            {/* The hour to staff for. One row of bars, the way the florist's
                page draws a spike of write-offs. */}
            <div className="mt-4 flex items-end gap-[2px] h-16" aria-hidden="true">
              {data.peak_hours.map((hour) => (
                <div
                  key={hour.hour}
                  title={`${formatHour(hour.hour)}: ${hour.orders}`}
                  className="flex-1 bg-sq-blue/20 rounded-t-[2px] min-h-[2px]"
                  style={{ height: `${Math.round((hour.orders / peak) * 100)}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-sq-muted">Замовлення за годинами доби.</p>
          </section>

          {/* ── Матриця меню ─────────────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <LayoutGrid size={20} className="text-sq-secondary" />
              Матриця меню
            </h2>
            <p className="mt-1 text-xs text-sq-muted">
              Популярність проти маржі. Страва «популярна», якщо її частка продажів не менша за{' '}
              {pct(data.menu.thresholds.popularity_share_bps)}, і «маржинальна», якщо з одиниці
              лишається не менше за {formatUah(data.menu.thresholds.unit_margin_cents)} — середнє
              по кухні за цей період.
            </p>

            {!data.menu.enough_data ? (
              // Rule 3: the numbers below are still true, only the verdict is
              // withheld. Four quadrants drawn from three sales would be a
              // recommendation made up out of nothing.
              <p className="mt-4 text-sm text-sq-muted" data-testid="cafe-not-enough">
                Замало продажів, щоб ділити меню на квадранти. Візьміть довший період — цифри
                нижче правильні й зараз, але порада з них ще не виходить.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="cafe-matrix">
                {groups.map(({ quadrant, rows }) => (
                  <div
                    key={quadrant}
                    className={`rounded-sq border p-3 ${TONE[quadrant]}`}
                    data-testid={`quadrant-${quadrant}`}
                  >
                    <p className="font-semibold text-sm">
                      {QUADRANT[quadrant].title}
                      <span className="font-normal opacity-70"> · {rows.length}</span>
                    </p>
                    <p className="text-xs opacity-80">{QUADRANT[quadrant].advice}</p>
                    {rows.length === 0 ? (
                      <p className="mt-2 text-xs opacity-60">Порожньо.</p>
                    ) : (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {rows.map((row) => (
                          <li key={row.variant_id} className="flex justify-between gap-2">
                            <span className="truncate">
                              {row.product_name}
                              {row.label && <span className="opacity-60"> · {row.label}</span>}
                            </span>
                            <span className="tabular-nums shrink-0 opacity-80">{row.sold}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.menu.rows.length === 0 ? (
              <p className="mt-4 text-sm text-sq-muted">За цей період нічого не продали.</p>
            ) : (
              <table className="mt-4 w-full text-sm" data-testid="cafe-menu-table">
                <thead className="text-xs text-sq-muted">
                  <tr className="text-left">
                    <th className="font-normal pb-1">Страва</th>
                    <th className="font-normal pb-1 text-right">Продано</th>
                    <th className="font-normal pb-1 text-right">Частка</th>
                    <th className="font-normal pb-1 text-right">Виторг</th>
                    <th className="font-normal pb-1 text-right">Маржа</th>
                    <th className="font-normal pb-1 text-right">З одиниці</th>
                  </tr>
                </thead>
                <tbody>
                  {data.menu.rows.map((row) => (
                    <tr key={row.variant_id} className="border-t border-sq-divider">
                      <td className="py-1.5">
                        {row.product_name}
                        {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                        {data.menu.enough_data && (
                          <span className="ml-1.5 text-[11px] text-sq-muted">
                            {QUADRANT[row.quadrant].title.toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.sold}</td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">
                        {pct(row.share_bps)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">
                        {formatUah(row.revenue_cents)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">
                        {formatUah(row.margin_cents)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-sq-muted">
                        {formatUah(row.unit_margin_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Rule 2. Named, with the reason — never silently a «dog». */}
            {data.menu.excluded.length > 0 && (
              <div className="mt-4" data-testid="cafe-excluded">
                <p className="text-xs font-semibold text-sq-text">Поза матрицею</p>
                <ul className="mt-1 space-y-0.5 text-xs text-sq-muted">
                  {data.menu.excluded.map((row) => (
                    <li key={row.variant_id}>
                      {row.product_name}
                      {row.label && <span> · {row.label}</span>} — {EXCLUSION_LABEL[row.reason]} (
                      {row.sold})
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-sq-muted">
                  Ці страви не класифіковані навмисно: без собівартості їхня маржа була б нулем, а
                  нуль тут означає «не знаємо», а не «безкоштовно».
                </p>
              </div>
            )}
          </section>

          {/* ── Що пішло не в чек ────────────────────────────────────── */}
          <section className="bg-white rounded-sq border border-sq-divider p-4">
            <h2 className="font-semibold text-sq-text flex items-center gap-2">
              <Trash2 size={20} className="text-sq-secondary" />
              Списання кухні
            </h2>
            <p className="mt-2 text-2xl font-semibold text-sq-text" data-testid="cafe-writeoff-total">
              {formatUah(data.writeoffs.total_cost_cents)}
            </p>
            <p className="text-xs text-sq-muted">
              за собівартістю, {data.from} — {data.to}
            </p>

            {data.writeoffs.rows.length === 0 ? (
              <p className="mt-3 text-sm text-sq-muted">За цей період нічого не списували.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.writeoffs.rows.map((row) => (
                  <span
                    key={row.reason}
                    className="text-xs px-2 py-1 rounded-[3px] bg-sq-bg text-sq-secondary"
                    data-testid={`cafe-writeoff-${row.reason}`}
                  >
                    {labelOfReason(row.reason)}: {formatUah(row.cost_cents)} ({row.quantity})
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-sq-muted">
              «Проба» і «Харчування персоналу» — це не втрати, а витрати, які варто бачити окремо
              від зіпсованого.
            </p>
          </section>

          {/* ── Зала ─────────────────────────────────────────────────── */}
          {/* Absent, not zero: a counter-service café has no bills, and
              «оборотність столу: 0» reads as a bad month rather than as a
              question that is not about this shop. */}
          {data.tables && (
            <section
              className="bg-white rounded-sq border border-sq-divider p-4"
              data-testid="cafe-tables"
            >
              <h2 className="font-semibold text-sq-text">Зала</h2>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                  label="Чек на стіл"
                  value={formatUah(data.tables.avg_bill_cents)}
                  hint={`${data.tables.bills} рахунків`}
                  strong
                />
                <Stat
                  label="На гостя"
                  value={
                    data.tables.avg_per_guest_cents != null
                      ? formatUah(data.tables.avg_per_guest_cents)
                      : '—'
                  }
                  hint={data.tables.guests > 0 ? `${data.tables.guests} гостей` : 'гостей не вказували'}
                />
                <Stat
                  label="Оборотів на стіл"
                  value={data.tables.turns_per_table_per_day.toFixed(1).replace('.', ',')}
                  hint="за день"
                />
                <Stat label="Триває візит" value={formatMinutes(data.tables.avg_minutes)} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
