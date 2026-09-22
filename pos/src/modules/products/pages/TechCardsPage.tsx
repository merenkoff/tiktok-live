// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah } from '@pos/platform';
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
    <div className="space-y-6 animate-fade-up text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Техкарти</h2>
        <p className="text-sq-secondary mt-1 text-sm">
          Скільки коштує зібрати страву і яку частку її ціни це з’їдає.
          Собівартість рахується <strong>за останніми цінами закупівлі</strong> складників,
          а не за середньою по партіях. Зверху — ті, що лишають найменше.
        </p>
      </div>

      {error && (
        <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm" data-testid="tech-cards-error">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="bg-sq-surface border border-sq-divider rounded-sq p-6 text-sm text-sq-secondary">
          У цьому магазині ще немає складених товарів — страв, букетів чи наборів,
          які збирають зі складників. Зробіть товар складеним у{' '}
          <Link to="/admin/products" className="text-sq-blue">
            картці товару
          </Link>
          , і його техкартка зʼявиться тут.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="bg-sq-surface border border-sq-divider rounded-sq overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-sq-bg/60 text-xs text-sq-secondary">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Страва</th>
                <th className="text-right font-medium px-4 py-2.5">Ціна</th>
                <th className="text-right font-medium px-4 py-2.5">Собівартість</th>
                <th className="text-right font-medium px-4 py-2.5">Food cost</th>
                <th className="text-right font-medium px-4 py-2.5">Складників</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sq-divider">
              {rows.map((row) => {
                const reason = missingReason(row);
                return (
                  <tr key={row.variant_id} className="hover:bg-sq-bg/40">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/admin/products?edit=${row.product_id}`}
                        className="text-sq-blue"
                      >
                        {row.product_name}
                      </Link>
                      {row.label && (
                        <span className="text-sq-secondary"> · {row.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.price_cents > 0 ? formatUah(row.price_cents) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatUah(row.cost_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {reason ? (
                        <span className="text-sq-secondary">
                          — <span className="text-xs">({reason})</span>
                        </span>
                      ) : (
                        <span className={toneOf(row.food_cost_bps!)}>
                          {foodCostPercent(row.food_cost_bps!)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sq-secondary">
                      {row.leaf_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
