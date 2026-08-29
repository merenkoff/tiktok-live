// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '../../lib/money';
import type { CatalogItem } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';

interface Props {
  productName: string;
  variants: CatalogItem[];
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}

export function VariantPicker({ productName, variants, onPick, onClose }: Props) {
  const listRef = useDragScroll<HTMLUListElement>();
  const sorted = [...variants].sort((a, b) => {
    if (a.quantity <= 0 && b.quantity > 0) return 1;
    if (a.quantity > 0 && b.quantity <= 0) return -1;
    return 0;
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div className="bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg">
        <div className="px-4 py-3.5 border-b border-sq-divider flex justify-between items-center gap-3">
          <h3 className="font-semibold text-sq-text truncate">{productName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0"
          >
            Закрити
          </button>
        </div>
        <ul ref={listRef} className="divide-y divide-sq-divider max-h-[60vh] overflow-auto select-none">
          {sorted.map((item) => {
            const label = [item.color, item.size].filter(Boolean).join(' / ') || 'Стандарт';
            const oos = item.quantity <= 0;
            return (
              <li key={item.variant_id}>
                <button
                  type="button"
                  disabled={oos}
                  onClick={() => onPick(item)}
                  className="w-full min-h-14 text-left px-4 py-3.5 disabled:opacity-50 hover:bg-sq-bg focus-visible:bg-sq-bg outline-none"
                >
                  <div className="flex justify-between gap-3">
                    <span className={`font-medium ${oos ? 'text-sq-muted' : 'text-sq-blue'}`}>
                      {label}
                    </span>
                    <span className="font-medium text-sq-text shrink-0">
                      {formatUah(item.price_cents)}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${oos ? 'text-red-600' : 'text-sq-secondary'}`}>
                    {oos ? 'Немає в наявності' : `${item.quantity} шт`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
