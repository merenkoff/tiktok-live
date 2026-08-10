import { useEffect, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { formatUah, uahInputToCents } from '../../lib/money';
import { assetUrl } from '../../lib/urls';
import type { CartDiscount, CartLine } from '../../hooks/useCart';
import { computeCartDiscountCents } from '../../hooks/useCart';
import type { PosCustomer } from '../../types';
import { CustomerPicker } from './CustomerPicker';

interface Props {
  lines: CartLine[];
  customer: PosCustomer | null;
  cartDiscount: CartDiscount | null;
  onSetCustomer: (c: PosCustomer | null) => void;
  onSetCartDiscount: (d: CartDiscount | null) => void;
  onSetQty: (variantId: number, qty: number) => void;
  onRemove: (variantId: number) => void;
  onCharge: () => void;
  onClose: () => void;
  onSaveBasket?: () => void;
}

export function MobileCartSheet({
  lines,
  customer,
  cartDiscount,
  onSetCustomer,
  onSetCartDiscount,
  onSetQty,
  onRemove,
  onCharge,
  onClose,
  onSaveBasket,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const discountCents = computeCartDiscountCents(lines, cartDiscount);
  const total = Math.max(0, subtotal - discountCents);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  useEffect(() => {
    if (!lines.some((l) => l.variant_id === selectedVariantId)) {
      setSelectedVariantId(null);
    }
  }, [lines, selectedVariantId]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрити" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-sq-sidebar rounded-t-sq flex flex-col animate-fade-up">
        <div className="px-4 py-3 border-b border-sq-divider bg-white flex items-center justify-between">
          <button type="button" className="text-left min-w-0" onClick={() => setPickerOpen(true)}>
            <p className="font-semibold text-sq-text truncate">
              {customer?.name ?? 'Клієнт не вибраний'}
            </p>
            <p className="text-sm text-sq-secondary">
              {count} {count === 1 ? 'товар' : 'товарів'}
            </p>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-3 py-2">
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
                      onClick={() =>
                        setSelectedVariantId((prev) =>
                          prev === line.variant_id ? null : line.variant_id
                        )
                      }
                      className={`w-full text-left rounded-sq px-2 py-2.5 flex gap-3 ${
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
                      <div className="min-w-0 flex-1 flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{line.product_name}</p>
                          {line.variant_label && (
                            <p className="text-xs text-sq-secondary mt-0.5">{line.variant_label}</p>
                          )}
                          {line.discount_label && (
                            <p className="text-xs text-sq-secondary mt-1 flex items-center gap-1">
                              <Tag size={12} />
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
                    </button>
                    {selected && (
                      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
                        <button
                          type="button"
                          className="h-10 w-10 rounded-sq border border-sq-divider bg-white"
                          onClick={() => onSetQty(line.variant_id, line.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="text-sm font-semibold w-6 text-center">{line.quantity}</span>
                        <button
                          type="button"
                          className="h-10 w-10 rounded-sq border border-sq-divider bg-white"
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

        <div className="px-3 py-2 border-t border-sq-divider bg-white text-sm">
          {discountCents > 0 && (
            <div className="flex justify-between text-sq-secondary mb-1">
              <span>Знижка на чек</span>
              <span>−{formatUah(discountCents)}</span>
            </div>
          )}
          <button type="button" className="text-sq-blue text-xs font-medium" onClick={() => setDiscountOpen(true)}>
            {cartDiscount ? 'Змінити знижку на чек' : 'Знижка на чек'}
          </button>
        </div>

        <div className="p-3 border-t border-sq-divider bg-white flex gap-2 safe-pb">
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
      </div>

      {pickerOpen && (
        <CustomerPicker
          currentId={customer?.id}
          onClose={() => setPickerOpen(false)}
          onSelect={onSetCustomer}
        />
      )}
      {discountOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDiscountOpen(false)} />
          <MobileDiscountForm
            current={cartDiscount}
            onClose={() => setDiscountOpen(false)}
            onApply={onSetCartDiscount}
          />
        </div>
      )}
    </div>
  );
}

function MobileDiscountForm({
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
    <div className="relative w-full bg-white rounded-t-sq p-4 space-y-3">
      <p className="font-semibold">Знижка на чек</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`flex-1 py-2 rounded-sq text-sm border ${type === 'percent' ? 'border-sq-blue text-sq-blue' : 'border-sq-divider'}`}
          onClick={() => setType('percent')}
        >
          %
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-sq text-sm border ${type === 'fixed' ? 'border-sq-blue text-sq-blue' : 'border-sq-divider'}`}
          onClick={() => setType('fixed')}
        >
          ₴
        </button>
      </div>
      <input
        className="pos-field text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={type === 'percent' ? '%' : 'грн'}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 py-2.5 text-sm"
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
  );
}
