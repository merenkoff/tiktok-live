// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, TagLine } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';
import { assetUrl } from '../../lib/urls';
import type { CartDiscount, CartLine } from '@pos/platform';
import { computeCartDiscountCents } from '@pos/platform';
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
  onSetQty: (uid: string, qty: number) => void;
  onRemove: (uid: string) => void;
  onClear: () => void;
  onCharge: () => void;
  onSaveBasket?: () => void;
  /** The shelf of carts any till can take back (POS_FLORIST_BENCH.md §9). */
  onOpenParked?: () => void;
  /** How many are waiting, for the badge. */
  parkedCount?: number;
  /**
   * A pre-order is on the till (`TechDocs/POS_FLORIST_BENCH.md` §14).
   *
   * Then this is not a cart but a promise the shop already made, at a price it
   * already named — so every edit control goes away. The server rings the
   * order's own lines from its own table, and an editable screen would show one
   * thing while the receipt said another. Anything extra is a second sale.
   */
  locked?: boolean;
  onCancelPreorder?: () => void;
  /** Take this cart as an order for a future day (§14). */
  onTakePreorder?: () => void;
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
  onOpenParked,
  parkedCount = 0,
  locked,
  onCancelPreorder,
  onTakePreorder,
}: Props) {
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const discountCents = computeCartDiscountCents(lines, cartDiscount);
  const total = Math.max(0, subtotal - discountCents);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    if (!lines.some((l) => l.uid === selectedUid)) {
      setSelectedUid(null);
    }
  }, [lines, selectedUid]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function toggleSelect(uid: string) {
    setSelectedUid((prev) => (prev === uid ? null : uid));
  }

  return (
    <aside
      className="bg-sq-sidebar border-l border-sq-divider flex flex-col min-h-0 h-full text-sq-text w-full max-w-[360px] ml-auto"
      data-testid="sale-sidebar"
    >
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
        {!locked && <div className="relative" ref={menuRef}>
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
              {onTakePreorder && (
                <button
                  type="button"
                  disabled={lines.length === 0}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-sq-bg disabled:opacity-40"
                  onClick={() => {
                    setMenuOpen(false);
                    onTakePreorder();
                  }}
                  data-testid="take-preorder"
                >
                  Замовлення наперед
                </button>
              )}
              {onOpenParked && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-sq-bg"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenParked();
                  }}
                >
                  Відкладені кошики{parkedCount > 0 ? ` (${parkedCount})` : ''}
                </button>
              )}
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
        </div>}
      </div>

      <div ref={listRef} className="flex-1 overflow-auto px-3 py-2 bg-sq-sidebar select-none">
        {lines.length === 0 ? (
          <p className="text-sm text-sq-secondary py-10 text-center">Додайте товар з каталогу</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line) => {
              const selected = selectedUid === line.uid;
              const lineTotal = line.unit_price_cents * line.quantity;
              const compareTotal =
                line.compare_at_cents != null ? line.compare_at_cents * line.quantity : null;
              return (
                <li key={line.uid}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(line.uid)}
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
                          {line.note && (
                            <p
                              className="text-xs text-sq-muted italic mt-0.5 truncate"
                              data-testid="cart-line-note"
                            >
                              <Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{line.note}
                            </p>
                          )}
                          {line.discount_label && (
                            <p className="text-xs text-sq-secondary mt-1 flex items-center gap-1">
                              <TagLine size={16} className="shrink-0" />
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
                  {selected && !locked && (
                    <div className="flex items-center gap-2 px-2 pb-2 pt-1">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-sq border border-sq-divider text-base bg-white"
                        onClick={() => onSetQty(line.uid, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="text-sm font-semibold w-6 text-center">{line.quantity}</span>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-sq border border-sq-divider text-base bg-white"
                        onClick={() => onSetQty(line.uid, line.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="ml-auto text-sm text-red-600 font-medium min-h-10 px-2"
                        onClick={() => onRemove(line.uid)}
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
        {/*
          A promise is paid or put back — never parked, never discounted. The
          shop already named this number; the only questions left are «платимо»
          and «повертаємо на потім».
        */}
        {locked ? (
          <button
            type="button"
            onClick={onCancelPreorder}
            className="flex-1 min-h-[48px] rounded-sq bg-sq-bg text-sq-secondary font-semibold text-sm"
            data-testid="preorder-put-back"
          >
            Повернути
          </button>
        ) : lines.length === 0 ? (
          <button
            type="button"
            disabled={!onOpenParked}
            onClick={onOpenParked}
            className="flex-1 min-h-[48px] rounded-sq bg-sq-bg text-sq-blue font-semibold text-sm disabled:opacity-40"
            data-testid="open-parked"
          >
            Відкладені{parkedCount > 0 ? ` (${parkedCount})` : ''}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSaveBasket}
            className="flex-1 min-h-[48px] rounded-sq bg-sq-bg text-sq-blue font-semibold text-sm disabled:opacity-40"
            data-testid="park-cart"
          >
            Відкласти
          </button>
        )}
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
