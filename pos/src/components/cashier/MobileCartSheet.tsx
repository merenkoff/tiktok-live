// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Minus, Pencil, Plus, TagLine, Trash2, User, X } from '../../platform/glyphs';
import { formatUah, uahInputToCents } from '../../lib/money';
import type { CartDiscount, CartLine } from '@pos/platform';
import { computeCartDiscountCents } from '@pos/platform';
import type { PosCustomer } from '../../types';
import { CustomerPicker } from './CustomerPicker';
import { useDragScroll } from '../../hooks/useDragScroll';

interface Props {
  lines: CartLine[];
  customer: PosCustomer | null;
  cartDiscount: CartDiscount | null;
  onSetCustomer: (c: PosCustomer | null) => void;
  onSetCartDiscount: (d: CartDiscount | null) => void;
  onSetQty: (uid: string, qty: number) => void;
  onRemove: (uid: string) => void;
  onCharge: () => void;
  onClose: () => void;
  onSaveBasket?: () => void;
  /** The shelf of carts any till can take back (POS_FLORIST_BENCH.md §9). */
  onOpenParked?: () => void;
  parkedCount?: number;
  /** A pre-order is on the till — see the note on `SaleSidebar` (§14). */
  locked?: boolean;
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
  onOpenParked,
  parkedCount = 0,
  locked,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const discountCents = computeCartDiscountCents(lines, cartDiscount);
  const total = Math.max(0, subtotal - discountCents);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const listRef = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    if (!lines.some((l) => l.uid === selectedUid)) {
      setSelectedUid(null);
    }
  }, [lines, selectedUid]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" aria-label="Закрити" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] flex flex-col overflow-hidden animate-fade-up text-sq-text">
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0" />
        <div className="pl-5 pr-3 pt-2 pb-2 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            className="min-w-0 min-h-11 -ml-1 px-1 rounded-lg text-left flex items-center gap-2 hover:bg-sq-bg"
            onClick={() => setPickerOpen(true)}
          >
            {customer && <User size={24} className="shrink-0" />}
            <span className="min-w-0">
              <span className={`block text-[17px] font-semibold truncate ${customer ? 'text-sq-heading' : 'text-sq-blue'}`}>
                {customer?.name ?? 'Клієнт не вибраний'}
              </span>
              <span className="block text-[13px] text-sq-muted tabular-nums">
                {count} {count === 1 ? 'товар' : 'товарів'}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-auto px-3 pb-2 select-none">
          {lines.length === 0 ? (
            <p className="text-[15px] text-sq-muted py-10 text-center">Додайте товар з каталогу</p>
          ) : (
            <ul>
              {lines.map((line) => {
                const selected = selectedUid === line.uid;
                const lineTotal = line.unit_price_cents * line.quantity;
                const compareTotal =
                  line.compare_at_cents != null ? line.compare_at_cents * line.quantity : null;
                const caption = [
                  line.variant_label,
                  line.quantity > 1 ? `${line.quantity} × ${formatUah(line.unit_price_cents)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={line.uid} className={`rounded-xl ${selected ? 'bg-sq-sidebar' : ''}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedUid((prev) => (prev === line.uid ? null : line.uid))
                      }
                      className={`w-full text-left px-2 min-h-[60px] py-2.5 flex gap-3 items-center transition-colors ${
                        selected ? '' : 'border-b border-sq-divider/70 hover:bg-sq-bg/60 rounded-xl'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-medium text-sq-text truncate">{line.product_name}</p>
                        {caption && (
                          <p className="text-[13px] text-sq-muted mt-0.5 truncate tabular-nums">{caption}</p>
                        )}
                        {line.note && (
                          <p
                            className="text-[13px] text-sq-muted italic mt-0.5 truncate"
                            data-testid="cart-line-note"
                          >
                            <Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{line.note}
                          </p>
                        )}
                        {line.discount_label && (
                          <p className="text-[13px] text-sq-secondary mt-0.5 flex items-center gap-1">
                            <TagLine size={16} className="shrink-0" />
                            {line.discount_label}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-medium tabular-nums">{formatUah(lineTotal)}</p>
                        {compareTotal != null && compareTotal > lineTotal && (
                          <p className="text-xs text-sq-muted line-through tabular-nums">
                            {formatUah(compareTotal)}
                          </p>
                        )}
                      </div>
                    </button>
                    {selected && (
                      <div className="flex items-center gap-2 px-2 pb-2.5">
                        <button
                          type="button"
                          aria-label="Менше"
                          className="h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider"
                          onClick={() => onSetQty(line.uid, line.quantity - 1)}
                        >
                          <Minus size={20} />
                        </button>
                        <span className="text-[17px] font-semibold w-8 text-center tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Більше"
                          className="h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider"
                          onClick={() => onSetQty(line.uid, line.quantity + 1)}
                        >
                          <Plus size={20} />
                        </button>
                        <button
                          type="button"
                          className="ml-auto min-h-10 px-2 inline-flex items-center gap-1 text-[15px] text-red-600 font-medium"
                          onClick={() => onRemove(line.uid)}
                        >
                          <Trash2 size={20} />
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

        <div className="px-5 pt-3 pb-4 bg-sq-sidebar border-t border-sq-divider/70 space-y-2.5 shrink-0 safe-pb">
          {discountCents > 0 && (
            <div className="flex justify-between text-[15px] text-sq-secondary">
              <span>Знижка на чек</span>
              <span className="tabular-nums">−{formatUah(discountCents)}</span>
            </div>
          )}
          <button type="button" className="text-sq-blue text-[13px] font-semibold" onClick={() => setDiscountOpen(true)}>
            {cartDiscount ? 'Змінити знижку на чек' : 'Знижка на чек'}
          </button>
          <div className="flex gap-2.5">
            {/* Same two-jobs rule as the sidebar — see the comment there. A
                promise is paid or put back from the sidebar, never parked. */}
            {locked ? null : lines.length === 0 ? (
              <button
                type="button"
                disabled={!onOpenParked}
                onClick={onOpenParked}
                className="flex-1 min-h-[52px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] disabled:opacity-40"
                data-testid="open-parked-mobile"
              >
                Відкладені{parkedCount > 0 ? ` (${parkedCount})` : ''}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSaveBasket}
                className="flex-1 min-h-[52px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] disabled:opacity-40"
                data-testid="park-cart-mobile"
              >
                Відкласти
              </button>
            )}
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={onCharge}
              aria-label={`Оплатити ${formatUah(total)}`}
              className="pos-btn-primary flex-[2] min-h-[52px] !rounded-xl text-[17px]"
            >
              Оплатити · {formatUah(total)}
            </button>
          </div>
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
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
            aria-label="Закрити"
            onClick={() => setDiscountOpen(false)}
          />
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
    <div
      role="dialog"
      aria-label="Знижка на чек"
      className="relative w-full bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] px-5 pb-5 space-y-4 animate-fade-up"
    >
      <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mt-2" />
      <p className="text-[19px] font-bold text-sq-heading">Знижка на чек</p>
      <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty" role="group" aria-label="Тип знижки">
        {(['percent', 'fixed'] as const).map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              className={`flex-1 min-h-11 rounded-[9px] text-[17px] transition-colors ${
                on
                  ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                  : 'font-medium text-sq-secondary'
              }`}
              onClick={() => setType(t)}
            >
              {t === 'percent' ? '%' : '₴'}
            </button>
          );
        })}
      </div>
      <input
        className="pos-field tabular-nums"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={type === 'percent' ? '%' : 'грн'}
      />
      <div className="flex gap-2.5">
        <button
          type="button"
          className="flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text"
          onClick={() => {
            onApply(null);
            onClose();
          }}
        >
          Скинути
        </button>
        <button
          type="button"
          className="pos-btn-primary flex-[2] min-h-[52px] rounded-xl text-[17px]"
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
