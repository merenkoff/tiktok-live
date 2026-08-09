import { X } from 'lucide-react';
import { formatUah } from '../../lib/money';
import type { CartLine } from '../../hooks/useCart';

interface Props {
  lines: CartLine[];
  totalCents: number;
  onSetQty: (variantId: number, qty: number) => void;
  onRemove: (variantId: number) => void;
  onCharge: () => void;
  onClose: () => void;
}

export function MobileCartSheet({
  lines,
  totalCents,
  onSetQty,
  onRemove,
  onCharge,
  onClose,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрити" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-white rounded-t-sq flex flex-col animate-fade-up">
        <div className="px-4 py-3 border-b border-sq-divider flex items-center justify-between">
          <p className="font-semibold text-sq-text">Поточний чек ({count})</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4">
          {lines.length === 0 ? (
            <p className="text-sm text-sq-secondary py-10 text-center">Додайте товар з каталогу</p>
          ) : (
            <ul className="divide-y divide-sq-divider">
              {lines.map((line) => (
                <li key={line.variant_id} className="py-3">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sq-blue">{line.product_name}</p>
                      {line.variant_label && (
                        <p className="text-xs text-sq-secondary mt-0.5">{line.variant_label}</p>
                      )}
                    </div>
                    <div className="flex items-start gap-1 shrink-0">
                      <span className="text-sm font-medium">
                        {formatUah(line.unit_price_cents * line.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(line.variant_id)}
                        className="min-h-10 min-w-10 grid place-items-center text-sq-muted"
                        aria-label="Видалити"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-sq border border-sq-divider"
                      onClick={() => onSetQty(line.variant_id, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold w-6 text-center">{line.quantity}</span>
                    <button
                      type="button"
                      className="h-10 w-10 rounded-sq border border-sq-divider"
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

        <div className="p-4 border-t border-sq-divider safe-pb">
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={onCharge}
            className="pos-btn-primary w-full py-3.5 text-[16px]"
          >
            Сплатити {formatUah(totalCents)}
          </button>
        </div>
      </div>
    </div>
  );
}
