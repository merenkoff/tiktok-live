// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatQuantity, isWeighed, unitPriceLabel } from '@pos/platform';
import type { ProductVariant } from '@pos/platform';
import { useDragScroll } from '@pos/platform/ui';
import { useMenuOnly } from '../lib/menuOnly';

/** The read-only variants of one product, as the list shows them. */
export function VariantsTable({
  variants,
  derived,
}: {
  variants: ProductVariant[];
  /** Whether the quantity column is computed from components rather than stored. */
  derived?: boolean;
}) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  // The marketer is sent no stock (track МР): no column rather than a column of
  // zeros — and no article or barcode either (МР5): those are the till's and
  // the storeroom's codes, not anything a guest reads.
  const stock = !useMenuOnly();
  const codes = stock;

  return (
    <div ref={scrollRef} className="mt-2 overflow-x-auto select-none">
      <table className="sq-table">
        <thead>
          <tr>
            <th>{codes ? 'Варіант' : 'Розмір'}</th>
            <th className={codes ? '!text-right' : '!text-right !pr-0'}>Ціна</th>
            {stock && <th className="!text-right">{derived ? 'Можна зібрати' : 'Залишок'}</th>}
            {codes && <th>Артикул</th>}
            {codes && <th className="!pr-0">Штрихкод</th>}
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id}>
              <td>{v.label || '—'}</td>
              <td className={`text-right tabular-nums whitespace-nowrap ${codes ? '' : '!pr-0'}`}>
                {unitPriceLabel(v.price_cents, v.unit, v.price_per)}
              </td>
              {stock && (
                <td className="text-right tabular-nums whitespace-nowrap">
                  {isWeighed(v.price_per) ? (
                    formatQuantity(Math.max(0, v.quantity), v.unit, v.price_per)
                  ) : (
                    <>
                      {v.quantity}
                      {v.unit ? <span className="text-[13px] text-sq-muted"> {v.unit}</span> : null}
                    </>
                  )}
                </td>
              )}
              {codes && <td className="text-[13px] text-sq-secondary tabular-nums">{v.sku || '—'}</td>}
              {codes && <td className="!pr-0 text-[13px] text-sq-secondary tabular-nums">{v.barcode || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
