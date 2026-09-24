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
import {
  AlertTriangle,
  Coffee,
  PageHeader,
  Puzzle,
  Repeat,
  SectionHead,
  Segmented,
  Star,
  type Glyph,
} from '@pos/platform/ui';
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

const RANGE_OPTIONS = RANGES.map((range) => ({
  value: String(range.days),
  label: range.label,
  testId: `range-${range.days}`,
}));

/** The quadrant's mark on its card — a colour glyph, the way every Things list has one. */
const QUADRANT_GLYPH: Record<keyof typeof QUADRANT, Glyph> = {
  star: Star,
  plowhorse: Repeat,
  puzzle: Puzzle,
  dog: AlertTriangle,
};

/** The quiet chip a tag or a status is drawn as. */
const CHIP =
  'inline-flex items-center h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary';

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
    <div className="space-y-7 animate-fade-up max-w-4xl text-sq-text" data-testid="cafe-analytics">
      <PageHeader
        glyph={Coffee}
        title="Меню й кухня"
        subtitle="Що тримати в меню, що переписати цінником і що прибрати."
        actions={
          <Segmented
            value={String(days)}
            options={RANGE_OPTIONS}
            onChange={(next) => setDays(Number(next))}
            ariaLabel="Період"
          />
        }
      />

      {loading && <p className="text-sm text-sq-muted">Рахуємо…</p>}
      {error && (
        <p className="text-sm text-red-600" data-testid="cafe-analytics-error">
          {error}
        </p>
      )}

      {data && !loading && !error && (
        <>
          {/* ── Скільки коштує кухня ──────────────────────────────────── */}
          <section>
            <SectionHead title="Скільки коштує те, що продали" />

            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
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
            <p className="mt-3 text-[13px] text-sq-muted leading-relaxed">
              Собівартість — за останніми цінами закупівлі, а не за тими, що були в день продажу.
              Магазин не веде партій, тож це орієнтир для меню, а не історичний факт.
              {blind > 0 && (
                <>
                  {' '}
                  <span className="text-amber-700" data-testid="cafe-blind-lines">
                    {blind} проданих позицій у цей відсоток не входять — у їхньому рецепті є
                    складник без собівартості.
                  </span>
                </>
              )}
            </p>

            {/* The hour to staff for. One row of bars, the way the florist's
                page draws a spike of write-offs. */}
            <div className="mt-5" aria-hidden="true">
              <div className="flex items-end gap-1 h-24">
                {data.peak_hours.map((hour) => (
                  <div
                    key={hour.hour}
                    title={`${formatHour(hour.hour)}: ${hour.orders}`}
                    className="flex-1 bg-sq-blue rounded-t-[4px] min-h-[2px]"
                    style={{ height: `${Math.round((hour.orders / peak) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                {data.peak_hours.map((hour) => (
                  <span
                    key={hour.hour}
                    className="flex-1 min-w-0 text-center text-[10px] text-sq-muted tabular-nums"
                  >
                    {hour.hour % 3 === 0 ? String(hour.hour).padStart(2, '0') : ''}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[13px] text-sq-muted">Замовлення за годинами доби.</p>
          </section>

          {/* ── Матриця меню ─────────────────────────────────────────── */}
          <section>
            <SectionHead title="Матриця меню" />
            <p className="mt-2 text-[13px] text-sq-muted leading-relaxed">
              Популярність проти маржі. Страва «популярна», якщо її частка продажів не менша за{' '}
              {pct(data.menu.thresholds.popularity_share_bps)}, і «маржинальна», якщо з одиниці
              лишається не менше за {formatUah(data.menu.thresholds.unit_margin_cents)} — середнє
              по кухні за цей період.
            </p>

            {!data.menu.enough_data ? (
              // Rule 3: the numbers below are still true, only the verdict is
              // withheld. Four quadrants drawn from three sales would be a
              // recommendation made up out of nothing.
              <p
                className="mt-4 rounded-xl bg-sq-sidebar px-[18px] py-4 text-[15px] text-sq-secondary leading-relaxed"
                data-testid="cafe-not-enough"
              >
                Замало продажів, щоб ділити меню на квадранти. Візьміть довший період — цифри
                нижче правильні й зараз, але порада з них ще не виходить.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5" data-testid="cafe-matrix">
                {groups.map(({ quadrant, rows }) => {
                  const Icon = QUADRANT_GLYPH[quadrant];
                  return (
                    <div key={quadrant} className="sq-card p-5" data-testid={`quadrant-${quadrant}`}>
                      <div className="flex items-center gap-2.5">
                        <Icon size={24} className="shrink-0" />
                        <p className="text-[17px] font-bold text-sq-heading">
                          {QUADRANT[quadrant].title}
                          <span className="ml-1.5 text-[13px] font-normal text-sq-muted tabular-nums">
                            {rows.length}
                          </span>
                        </p>
                      </div>
                      <p className="mt-1 text-[13px] text-sq-secondary">{QUADRANT[quadrant].advice}</p>
                      {rows.length === 0 ? (
                        <p className="mt-3 text-[13px] text-sq-muted">Порожньо.</p>
                      ) : (
                        <ul className="mt-2">
                          {rows.map((row) => (
                            <li
                              key={row.variant_id}
                              className="sq-row min-h-10 py-1.5 flex items-center justify-between gap-3"
                            >
                              <span className="truncate text-[15px] text-sq-text">
                                {row.product_name}
                                {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                              </span>
                              <span className="text-sm text-sq-muted tabular-nums shrink-0">{row.sold}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {data.menu.rows.length === 0 ? (
              <p className="mt-4 text-[15px] text-sq-secondary">За цей період нічого не продали.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="sq-table" data-testid="cafe-menu-table">
                  <thead>
                    <tr>
                      <th>Страва</th>
                      <th className="text-right">Продано</th>
                      <th className="text-right">Частка</th>
                      <th className="text-right">Виторг</th>
                      <th className="text-right">Маржа</th>
                      <th className="text-right">З одиниці</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.menu.rows.map((row) => (
                      <tr key={row.variant_id}>
                        <td>
                          {row.product_name}
                          {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                          {data.menu.enough_data && (
                            <span className={`ml-2 align-middle ${CHIP}`}>
                              {QUADRANT[row.quadrant].title.toLowerCase()}
                            </span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{row.sold}</td>
                        <td className="text-right tabular-nums text-sq-muted">
                          {pct(row.share_bps)}
                        </td>
                        <td className="text-right tabular-nums text-sq-muted">
                          {formatUah(row.revenue_cents)}
                        </td>
                        <td className="text-right tabular-nums font-semibold text-sq-heading">
                          {formatUah(row.margin_cents)}
                        </td>
                        <td className="text-right tabular-nums text-sq-muted">
                          {formatUah(row.unit_margin_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rule 2. Named, with the reason — never silently a «dog». */}
            {data.menu.excluded.length > 0 && (
              <div className="mt-5" data-testid="cafe-excluded">
                <p className="sq-section-label">Поза матрицею</p>
                <ul className="mt-1">
                  {data.menu.excluded.map((row) => (
                    <li
                      key={row.variant_id}
                      className="sq-row min-h-11 py-1.5 flex items-center gap-3"
                    >
                      <span className="flex-1 min-w-0 text-[15px] text-sq-text">
                        {row.product_name}
                        {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                        <span className="text-sq-secondary"> — {EXCLUSION_LABEL[row.reason]}</span>
                      </span>
                      <span className="text-sm text-sq-muted tabular-nums shrink-0">({row.sold})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-sq-muted leading-relaxed">
                  Ці страви не класифіковані навмисно: без собівартості їхня маржа була б нулем, а
                  нуль тут означає «не знаємо», а не «безкоштовно».
                </p>
              </div>
            )}
          </section>

          {/* ── Що пішло не в чек ────────────────────────────────────── */}
          <section>
            <SectionHead title="Списання кухні" />
            <p
              className="mt-3 text-[26px] font-bold text-sq-heading tabular-nums leading-tight"
              data-testid="cafe-writeoff-total"
            >
              {formatUah(data.writeoffs.total_cost_cents)}
            </p>
            <p className="mt-0.5 text-[13px] text-sq-muted tabular-nums">
              за собівартістю, {data.from} — {data.to}
            </p>

            {data.writeoffs.rows.length === 0 ? (
              <p className="mt-3 text-[15px] text-sq-secondary">За цей період нічого не списували.</p>
            ) : (
              <ul className="mt-2">
                {data.writeoffs.rows.map((row) => (
                  <li
                    key={row.reason}
                    className="sq-row min-h-11 py-1.5 flex items-center gap-3"
                    data-testid={`cafe-writeoff-${row.reason}`}
                  >
                    <span className="flex-1 min-w-0 text-[15px] text-sq-text">
                      {labelOfReason(row.reason)}
                    </span>
                    <span className="text-sm text-sq-muted tabular-nums">({row.quantity})</span>
                    <span className="w-28 text-right text-[15px] font-semibold text-sq-text tabular-nums">
                      {formatUah(row.cost_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[13px] text-sq-muted">
              «Проба» і «Харчування персоналу» — це не втрати, а витрати, які варто бачити окремо
              від зіпсованого.
            </p>
          </section>

          {/* ── Зала ─────────────────────────────────────────────────── */}
          {/* Absent, not zero: a counter-service café has no bills, and
              «оборотність столу: 0» reads as a bad month rather than as a
              question that is not about this shop. */}
          {data.tables && (
            <section data-testid="cafe-tables">
              <SectionHead title="Зала" />
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
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
