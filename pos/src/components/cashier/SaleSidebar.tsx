import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Tag } from 'lucide-react';
import { formatUah } from '../../lib/money';
import { assetUrl } from '../../lib/urls';
import type { CartLine } from '../../hooks/useCart';

interface Props {
  staffName: string;
  lines: CartLine[];
  totalCents: number;
  onSetQty: (variantId: number, qty: number) => void;
  onRemove: (variantId: number) => void;
  onClear: () => void;
  onCharge: () => void;
  onSaveBasket?: () => void;
}

export function SaleSidebar({
  staffName,
  lines,
  totalCents,
  onSetQty,
  onRemove,
  onClear,
  onCharge,
  onSaveBasket,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lines.some((l) => l.variant_id === selectedVariantId)) {
      setSelectedVariantId(null);
    }
  }, [lines, selectedVariantId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function toggleSelect(variantId: number) {
    setSelectedVariantId((prev) => (prev === variantId ? null : variantId));
  }

  return (
    <aside className="bg-sq-sidebar border-l border-sq-divider flex flex-col min-h-0 h-full text-sq-text w-full max-w-[360px] ml-auto">
      <div className="px-4 py-3 border-b border-sq-divider bg-white flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold truncate">{staffName || 'Касир'}</p>
          <p className="text-sm text-sq-secondary mt-0.5">
            {count} {count === 1 ? 'товар' : 'товарів'}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-h-10 min-w-10 grid place-items-center text-sq-secondary hover:text-sq-text rounded-sq"
            aria-label="Меню чека"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-sq border border-sq-divider bg-white shadow-md py-1">
              <button
                type="button"
                disabled={lines.length === 0}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-sq-bg disabled:opacity-40"
                onClick={() => {
                  setMenuOpen(false);
                  onClear();
                }}
              >
                Очистити кошик
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 bg-sq-sidebar">
        {lines.length === 0 ? (
          <p className="text-sm text-sq-secondary py-10 text-center">Додайте товар з каталогу</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line) => {
              const selected = selectedVariantId === line.variant_id;
              const lineTotal = line.unit_price_cents * line.quantity;
              return (
                <li key={line.variant_id}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(line.variant_id)}
                    className={`w-full text-left rounded-sq px-2 py-2.5 flex gap-3 transition-colors ${
                      selected ? 'bg-white ring-1 ring-sq-blue/40' : 'hover:bg-white/70'
                    }`}
                  >
                    <div className="relative w-12 h-12 rounded-sq bg-sq-empty shrink-0 overflow-hidden">
                      {line.image_url ? (
                        <img
                          src={assetUrl(line.image_url) ?? undefined}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      {line.quantity > 1 && (
                        <span className="absolute top-0 left-0 text-[10px] font-semibold bg-black/70 text-white px-1 py-0.5 rounded-br-sq">
                          {line.quantity}×
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 items-start">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-sq-text truncate">
                            {line.product_name}
                          </p>
                          {line.variant_label && (
                            <p className="text-xs text-sq-secondary mt-0.5 truncate">
                              {line.variant_label}
                            </p>
                          )}
                          {line.discount_label && (
                            <p className="text-xs text-sq-secondary mt-1 flex items-center gap-1">
                              <Tag size={12} className="shrink-0" />
                              {line.discount_label}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{formatUah(lineTotal)}</p>
                          {line.compare_at_cents != null &&
                            line.compare_at_cents > lineTotal && (
                              <p className="text-xs text-sq-muted line-through">
                                {formatUah(line.compare_at_cents)}
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </button>
                  {selected && (
                    <div className="flex items-center gap-2 px-2 pb-2 pt-1">
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
                      <button
                        type="button"
                        className="ml-auto text-sm text-red-600 font-medium min-h-10 px-2"
                        onClick={() => onRemove(line.variant_id)}
                      >
                        Видалити
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="p-3 border-t border-sq-divider bg-white flex gap-2">
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onSaveBasket}
          className="flex-1 min-h-[48px] rounded-sq bg-sq-bg text-sq-blue font-semibold text-sm disabled:opacity-40"
        >
          Зберегти кошик
        </button>
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onCharge}
          className="pos-btn-primary flex-[2] min-h-[48px] text-[15px]"
        >
          Сплатити {formatUah(totalCents)}
        </button>
      </div>
    </aside>
  );
}
