import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Tag } from 'lucide-react';
import { formatUah } from '../../lib/money';
import { assetUrl } from '../../lib/urls';
import type { CartDiscount, CartLine } from '../../hooks/useCart';
import { computeCartDiscountCents } from '../../hooks/useCart';
import type { PosCustomer } from '../../types';
import { CustomerPicker } from './CustomerPicker';
import { uahInputToCents } from '../../lib/money';
import { useDragScroll } from '../../hooks/useDragScroll';

interface Props {
  staffName: string;
  lines: CartLine[];
  customer: PosCustomer | null;
  cartDiscount: CartDiscount | null;
  onSetCustomer: (c: PosCustomer | null) => void;
  onSetCartDiscount: (d: CartDiscount | null) => void;
  onSetQty: (variantId: number, qty: number) => void;
  onRemove: (variantId: number) => void;
  onClear: () => void;
  onCharge: () => void;
  onSaveBasket?: () => void;
}

export function SaleSidebar({
  staffName,
  lines,
  customer,
  cartDiscount,
  onSetCustomer,
  onSetCartDiscount,
  onSetQty,
  onRemove,
  onClear,
  onCharge,
  onSaveBasket,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const discountCents = computeCartDiscountCents(lines, cartDiscount);
  const total = Math.max(0, subtotal - discountCents);

  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useDragScroll<HTMLDivElement>();

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
        <button type="button" className="min-w-0 text-left flex-1" onClick={() => setPickerOpen(true)}>
          <p className="text-[15px] font-semibold truncate">
            {customer?.name ?? 'Клієнт не вибраний'}
          </p>
          <p className="text-sm text-sq-secondary mt-0.5">
            {count} {count === 1 ? 'товар' : 'товарів'}
            {customer?.phone ? ` · ${customer.phone}` : ''}
          </p>
          <p className="text-[11px] text-sq-muted mt-0.5">Касир: {staffName || '—'}</p>
        </button>
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
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-sq border border-sq-divider bg-white shadow-md py-1">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-sq-bg"
                onClick={() => {
                  setMenuOpen(false);
                  setDiscountOpen(true);
                }}
              >
                Знижка на чек
              </button>
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

      <div ref={listRef} className="flex-1 overflow-auto px-3 py-2 bg-sq-sidebar select-none">
        {lines.length === 0 ? (
          <p className="text-sm text-sq-secondary py-10 text-center">Додайте товар з каталогу</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line) => {
              const selected = selectedVariantId === line.variant_id;
              const lineTotal = line.unit_price_cents * line.quantity;
              const compareTotal =
                line.compare_at_cents != null ? line.compare_at_cents * line.quantity : null;
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
                          {compareTotal != null && compareTotal > lineTotal && (
                            <p className="text-xs text-sq-muted line-through">
                              {formatUah(compareTotal)}
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

      <div className="px-3 py-2 border-t border-sq-divider bg-white space-y-1 text-sm">
        {discountCents > 0 && (
          <div className="flex justify-between text-sq-secondary">
            <span>Знижка на чек</span>
            <span>−{formatUah(discountCents)}</span>
          </div>
        )}
        <button
          type="button"
          className="text-sq-blue text-xs font-medium"
          onClick={() => setDiscountOpen(true)}
        >
          {cartDiscount ? 'Змінити знижку на чек' : 'Знижка на чек'}
        </button>
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
          Сплатити {formatUah(total)}
        </button>
      </div>

      {pickerOpen && (
        <CustomerPicker
          currentId={customer?.id}
          onClose={() => setPickerOpen(false)}
          onSelect={onSetCustomer}
        />
      )}
      {discountOpen && (
        <CartDiscountSheet
          current={cartDiscount}
          onClose={() => setDiscountOpen(false)}
          onApply={onSetCartDiscount}
        />
      )}
    </aside>
  );
}

function CartDiscountSheet({
  current,
  onClose,
  onApply,
}: {
  current: CartDiscount | null;
  onClose: () => void;
  onApply: (d: CartDiscount | null) => void;
}) {
  const [type, setType] = useState<'percent' | 'fixed'>(current?.type ?? 'percent');
  const [value, setValue] = useState(
    current
      ? current.type === 'percent'
        ? String(current.value)
        : (current.value / 100).toFixed(2)
      : ''
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрити" />
      <div className="relative w-full max-w-sm bg-white rounded-t-sq sm:rounded-sq p-4 space-y-3 shadow-lg">
        <p className="font-semibold">Знижка на чек</p>
        <p className="text-xs text-sq-secondary">
          Лише на позиції без товарної знижки
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 py-2 rounded-sq text-sm font-medium border ${
              type === 'percent' ? 'border-sq-blue text-sq-blue bg-sq-blue/5' : 'border-sq-divider'
            }`}
            onClick={() => setType('percent')}
          >
            %
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-sq text-sm font-medium border ${
              type === 'fixed' ? 'border-sq-blue text-sq-blue bg-sq-blue/5' : 'border-sq-divider'
            }`}
            onClick={() => setType('fixed')}
          >
            ₴
          </button>
        </div>
        <input
          className="pos-field text-sm"
          inputMode="decimal"
          placeholder={type === 'percent' ? 'Напр. 10' : 'Сума, грн'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 py-2.5 text-sm text-sq-secondary"
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            Скинути
          </button>
          <button
            type="button"
            className="pos-btn-primary flex-[2] py-2.5 text-sm"
            onClick={() => {
              if (type === 'percent') {
                const pct = Math.round(Number(value));
                if (!Number.isFinite(pct) || pct <= 0) return;
                onApply({ type: 'percent', value: Math.min(100, pct) });
              } else {
                const cents = uahInputToCents(value);
                if (cents <= 0) return;
                onApply({ type: 'fixed', value: cents });
              }
              onClose();
            }}
          >
            Застосувати
          </button>
        </div>
      </div>
    </div>
  );
}
