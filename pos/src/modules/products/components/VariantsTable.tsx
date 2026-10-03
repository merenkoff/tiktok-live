// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '@pos/platform';
import type { ProductVariant } from '@pos/platform';
import { useDragScroll } from '@pos/platform/ui';

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

  return (
    <div ref={scrollRef} className="mt-2 overflow-x-auto select-none">
      <table className="sq-table">
        <thead>
          <tr>
            <th>Варіант</th>
            <th className="!text-right">Ціна</th>
            <th className="!text-right">{derived ? 'Можна зібрати' : 'Залишок'}</th>
            <th>Артикул</th>
            <th className="!pr-0">Штрихкод</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id}>
              <td>{v.label || '—'}</td>
              <td className="text-right tabular-nums whitespace-nowrap">{formatUah(v.price_cents)}</td>
              <td className="text-right tabular-nums whitespace-nowrap">
                {v.quantity}
                {v.unit ? <span className="text-[13px] text-sq-muted"> {v.unit}</span> : null}
              </td>
              <td className="text-[13px] text-sq-secondary tabular-nums">{v.sku || '—'}</td>
              <td className="!pr-0 text-[13px] text-sq-secondary tabular-nums">{v.barcode || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
