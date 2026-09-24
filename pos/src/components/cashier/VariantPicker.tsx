// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '../../lib/money';
import type { CatalogItem } from '../../types';
import { useDragScroll } from '../../hooks/useDragScroll';
import { ChevronRight, X } from '../../platform/glyphs';

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
    <div className="fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label={productName}
        className="bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
        data-testid="variant-picker"
      >
        <div className="pl-5 pr-3 pt-4 pb-2 flex justify-between items-center gap-3">
          <h3 className="text-[19px] font-bold text-sq-heading truncate">{productName}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <ul ref={listRef} className="px-2 pb-2 max-h-[60vh] overflow-auto select-none">
          {sorted.map((item) => {
            const label = item.label || 'Стандарт';
            const oos = item.quantity <= 0;
            return (
              <li key={item.variant_id}>
                <button
                  type="button"
                  disabled={oos}
                  onClick={() => onPick(item)}
                  className="w-full min-h-16 rounded-[14px] text-left px-3.5 py-2.5 flex items-center gap-3 disabled:opacity-50 hover:bg-sq-sidebar focus-visible:bg-sq-sidebar active:bg-sq-selected outline-none"
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[17px] font-semibold truncate ${oos ? 'text-sq-muted' : 'text-sq-text'}`}>
                      {label}
                    </span>
                    <span className={`block text-[13px] ${oos ? 'text-red-600' : 'text-sq-muted'}`}>
                      {oos ? 'Немає в наявності' : `${item.quantity} ${item.unit || 'шт'}`}
                    </span>
                  </span>
                  <span className="text-[17px] font-semibold text-sq-text tabular-nums shrink-0">
                    {formatUah(item.price_cents)}
                  </span>
                  <ChevronRight size={20} className="text-sq-muted shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
