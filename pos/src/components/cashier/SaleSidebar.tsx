import { ChevronRight, Trash2, X } from 'lucide-react';
import { formatUah } from '../../lib/money';
import type { CartLine } from '../../hooks/useCart';

interface Props {
  staffName: string;
  lines: CartLine[];
  totalCents: number;
  onSetQty: (variantId: number, qty: number) => void;
  onRemove: (variantId: number) => void;
  onClear: () => void;
  onCharge: () => void;
}

export function SaleSidebar({
  staffName,
  lines,
  totalCents,
  onSetQty,
  onRemove,
  onClear,
  onCharge,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <aside className="bg-white border-l border-sq-divider flex flex-col min-h-0 h-full text-sq-text w-full max-w-[360px] ml-auto">
      <div className="px-4 py-3 border-b border-sq-divider flex items-center justify-between">
        <p className="text-sm font-semibold">Поточний чек ({count})</p>
        <button
          type="button"
          onClick={onClear}
          disabled={lines.length === 0}
          className="min-h-10 min-w-10 grid place-items-center text-sq-secondary hover:text-red-600 disabled:opacity-40"
          aria-label="Очистити"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="mx-3 mt-3 mb-1 flex items-center gap-2 rounded-sq bg-sq-bg px-3 py-2.5 text-sm">
        <div className="w-8 h-8 rounded-full bg-sq-blue text-white grid place-items-center text-xs font-semibold shrink-0">
          {staffName.slice(0, 1).toUpperCase()}
        </div>
        <span className="flex-1 truncate font-medium">{staffName}</span>
        <ChevronRight size={16} className="text-sq-muted" />
      </div>

      <div className="flex-1 overflow-auto px-4 py-2">
        {lines.length === 0 ? (
          <p className="text-sm text-sq-secondary py-10 text-center">Додайте товар з каталогу</p>
        ) : (
          <ul className="divide-y divide-sq-divider">
            {lines.map((line) => (
              <li key={line.variant_id} className="py-3">
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-sq-blue truncate">{line.product_name}</p>
                    {line.variant_label && (
                      <p className="text-xs text-sq-secondary mt-0.5">{line.variant_label}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium">
                      {formatUah(line.unit_price_cents * line.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(line.variant_id)}
                      className="min-h-10 min-w-10 grid place-items-center text-sq-muted hover:text-red-600"
                      aria-label="Видалити"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-sq border border-sq-divider text-base bg-white"
                    onClick={() => onSetQty(line.variant_id, line.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold w-6 text-center">{line.quantity}</span>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-sq border border-sq-divider text-base bg-white"
                    onClick={() => onSetQty(line.variant_id, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-sq-divider bg-white">
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onCharge}
          className="pos-btn-primary w-full py-3.5 text-[16px]"
        >
          Сплатити {formatUah(totalCents)}
        </button>
      </div>
    </aside>
  );
}
