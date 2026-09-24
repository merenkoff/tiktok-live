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
import { Flower2, PageHeader, SectionHead, Segmented } from '@pos/platform/ui';
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

const RANGE_OPTIONS = RANGES.map((range) => ({
  value: String(range.days),
  label: range.label,
  testId: `range-${range.days}`,
}));

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
    <div className="space-y-7 animate-fade-up max-w-4xl text-sq-text" data-testid="flower-analytics">
      <PageHeader
        glyph={Flower2}
        title="Квіти"
        subtitle="Що завʼяло, що справді йде і чи заробила робота флориста."
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
        <p className="text-sm text-red-600" data-testid="flower-analytics-error">
          {error}
        </p>
      )}

      {data && !loading && !error && (
        <>
          {/* ── Що в смітнику ─────────────────────────────────────────── */}
          <section>
            <SectionHead title="У смітнику" />

            <p
              className="mt-3 text-[26px] font-bold text-sq-heading tabular-nums leading-tight"
              data-testid="loss-total"
            >
              {formatUah(data.loss.total_cost_cents)}
            </p>
            <p className="mt-0.5 text-[13px] text-sq-muted tabular-nums">
              за собівартістю, {data.from} — {data.to}
            </p>

            {data.loss.by_reason.length > 0 && (
              <ul className="mt-2">
                {data.loss.by_reason.map((row) => (
                  <li key={row.reason} className="sq-row min-h-11 py-1.5 flex items-center gap-3">
                    <span className="flex-1 min-w-0 text-[15px] text-sq-text">
                      {REASON_LABEL[row.reason]}
                    </span>
                    <span className="text-sm text-sq-muted tabular-nums">({row.quantity})</span>
                    <span className="w-28 text-right text-[15px] font-semibold text-sq-text tabular-nums">
                      {formatUah(row.cost_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* One line worth drawing: a spike says a delivery sat too long. */}
            <div className="mt-5 flex items-end gap-1 h-20" aria-hidden="true">
              {data.daily_loss.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${formatUah(day.cost_cents)}`}
                  className="flex-1 bg-sq-blue rounded-t-[4px] min-h-[2px]"
                  style={{ height: `${Math.round((day.cost_cents / peakLoss) * 100)}%` }}
                />
              ))}
            </div>

            {data.loss.top_variants.length === 0 ? (
              <p className="mt-4 text-[15px] text-sq-secondary">За цей період нічого не списували.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="sq-table">
                  <thead>
                    <tr>
                      <th>Позиція</th>
                      <th className="text-right">Списано</th>
                      <th className="text-right">Прийшло</th>
                      <th className="text-right">Частка</th>
                      <th className="text-right">Собівартість</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.loss.top_variants.map((row) => (
                      <tr key={row.variant_id}>
                        <td>
                          {row.product_name}
                          {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                        </td>
                        <td className="text-right tabular-nums">
                          {row.written_off} {row.unit}
                        </td>
                        <td className="text-right tabular-nums text-sq-muted">
                          {row.received || '—'}
                        </td>
                        <td
                          className={`text-right tabular-nums font-semibold ${
                            (row.waste_bps ?? 0) >= 2000 ? 'text-sq-danger' : 'text-sq-text'
                          }`}
                        >
                          {pct(row.waste_bps)}
                        </td>
                        <td className="text-right tabular-nums">{formatUah(row.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[13px] text-sq-muted leading-relaxed">
              «Частка» — списано проти того, що прийшло за цей самий період. Магазин не веде
              партій, тож це орієнтир для закупівлі, а не вік конкретного стебла.
            </p>
          </section>

          {/* ── Топ стебел ────────────────────────────────────────────── */}
          <section>
            <SectionHead title="Що справді йде" />
            <p className="mt-2 text-[13px] text-sq-muted leading-relaxed">
              Разом із тим, що пішло всередині букетів — цього не видно у звичайному топі
              товарів, бо там рахуються картки букетів, а не стебла.
            </p>

            {data.stems.length === 0 ? (
              <p className="mt-4 text-[15px] text-sq-secondary">За цей період нічого не продали.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="sq-table" data-testid="stem-table">
                  <thead>
                    <tr>
                      <th>Позиція</th>
                      <th className="text-right">Поштучно</th>
                      <th className="text-right">У букетах</th>
                      <th className="text-right">Разом</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stems.map((row) => (
                      <tr key={row.variant_id}>
                        <td>
                          {row.product_name}
                          {row.label && <span className="text-sq-muted"> · {row.label}</span>}
                        </td>
                        <td className="text-right tabular-nums text-sq-muted">{row.loose}</td>
                        <td className="text-right tabular-nums text-sq-muted">{row.in_bouquets}</td>
                        <td className="text-right tabular-nums font-semibold text-sq-heading">
                          {row.total} {row.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Реалізована націнка ───────────────────────────────────── */}
          <section>
            <SectionHead title="Реалізована націнка" />

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              <Stat label="Виторг" value={formatUah(data.margin.total_revenue_cents)} />
              <Stat label="Собівартість" value={formatUah(data.margin.total_cost_cents)} />
              <Stat label="Заробіток" value={formatUah(data.margin.total_margin_cents)} strong />
            </div>

            {bouquets && (
              <p className="mt-4 text-[15px] text-sq-text" data-testid="bouquet-markup">
                На букетах — <strong>{pct(bouquets.markup_bps)}</strong> націнки на собівартість
                стебел, {bouquets.lines}{' '}
                {bouquets.lines === 1 ? 'рядок' : bouquets.lines < 5 ? 'рядки' : 'рядків'}.
              </p>
            )}
            <p className="mt-2 text-[13px] text-sq-muted leading-relaxed">
              Магазин просить <strong className="text-sq-secondary">{pct(data.margin.labour_bps)}</strong>{' '}
              за збирання поверх роздрібної ціни стебел. Цифра вище — те, що лишилося після знижок,
              і рахується вона від собівартості, тож більша за неї.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
