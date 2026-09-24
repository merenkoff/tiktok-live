// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah } from '@pos/platform';
import { FileText, PageHeader } from '@pos/platform/ui';
import { listTechCards, type TechCardRow } from '../data/techCardsApi';
import { foodCostPercent, missingReason, sortTechCards } from '../data/techCards';

/**
 * How alarming a food cost is. Deliberately coarse and deliberately silent
 * below 30 %: a florist's bouquet and a café's coffee live at different
 * numbers, and a threshold that claimed to know the right one for both would
 * be advice we cannot back. Red is reserved for the case nobody argues with —
 * the dish costs more than it sells for.
 */
function toneOf(bps: number): string {
  if (bps >= 10000) return 'text-red-600 font-semibold';
  if (bps >= 5000) return 'text-amber-700 font-medium';
  return 'text-sq-text';
}

/**
 * «Техкарти» — what every composite costs to assemble and what share of its
 * price that is (café phase К5d, TechDocs/POS_CAFE.md §10).
 *
 * The rule the whole screen rests on: a dish with one unpriced ingredient has
 * NO honest food cost, so it shows «—» and the reason, never 0 %. Zero per
 * cent here is not a rounding error, it is a number the owner would reprice
 * the menu on.
 */
export function TechCardsPage() {
  const [rows, setRows] = useState<TechCardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTechCards()
      .then((list) => setRows(sortTechCards(list)))
      .catch(() => setError('Не вдалося завантажити техкарти'));
  }, []);

  return (
    <div className="animate-fade-up text-sq-text max-w-5xl">
      <PageHeader
        glyph={FileText}
        title="Техкарти"
        subtitle={
          <>
            Скільки коштує зібрати страву і яку частку її ціни це з’їдає.
            Собівартість рахується{' '}
            <strong className="font-semibold text-sq-text">за останніми цінами закупівлі</strong>{' '}
            складників, а не за середньою по партіях. Зверху — ті, що лишають найменше.
          </>
        }
      />

      {error && (
        <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="tech-cards-error">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <FileText size={48} />
          <p className="text-[15px] text-sq-secondary max-w-md leading-relaxed">
            У цьому магазині ще немає складених товарів — страв, букетів чи наборів,
            які збирають зі складників. Зробіть товар складеним у{' '}
            <Link to="/admin/products" className="text-sq-blue font-semibold">
              картці товару
            </Link>
            , і його техкартка зʼявиться тут.
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <table className="sq-table">
          <thead>
            <tr>
              <th>Страва</th>
              <th className="!text-right">Ціна</th>
              <th className="!text-right">Собівартість</th>
              <th className="!text-right">Food cost</th>
              <th className="!text-right !pr-0">Складників</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const reason = missingReason(row);
              return (
                <tr key={row.variant_id}>
                  <td>
                    <Link
                      to={`/admin/products?edit=${row.product_id}`}
                      className="text-sq-blue font-medium"
                    >
                      {row.product_name}
                    </Link>
                    {row.label && (
                      <span className="text-sq-muted"> · {row.label}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.price_cents > 0 ? formatUah(row.price_cents) : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatUah(row.cost_cents)}
                  </td>
                  <td className="text-right tabular-nums">
                    {reason ? (
                      <span className="text-sq-muted">
                        — <span className="text-[13px]">({reason})</span>
                      </span>
                    ) : (
                      <span className={toneOf(row.food_cost_bps!)}>
                        {foodCostPercent(row.food_cost_bps!)}
                      </span>
                    )}
                  </td>
                  <td className="!pr-0 text-right tabular-nums text-sq-muted">
                    {row.leaf_count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
