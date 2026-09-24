// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef, useState } from 'react';
import { Minus, MoreHorizontal, Pencil, Plus, TagLine, Trash2, User } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';
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

  const positions = lines.length;
  return (
    <aside
      className="bg-sq-surface border-l border-sq-divider/70 flex flex-col min-h-0 h-full text-sq-text w-full max-w-[360px] ml-auto"
      data-testid="sale-sidebar"
    >
      {/* Things-style head: the list's title, then who it is for. */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 className="text-[20px] font-bold text-sq-heading">Чек</h2>
        {!locked && <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-h-10 min-w-10 grid place-items-center text-sq-secondary hover:text-sq-text rounded-full hover:bg-sq-bg"
            aria-label="Меню чека"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[200px] rounded-xl bg-white shadow-card py-1.5">
              <button
                type="button"
                className="w-full text-left px-3.5 py-2 text-[15px] hover:bg-sq-bg"
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
                  className="w-full text-left px-3.5 py-2 text-[15px] hover:bg-sq-bg disabled:opacity-40"
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
                  className="w-full text-left px-3.5 py-2 text-[15px] hover:bg-sq-bg"
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
                className="w-full text-left px-3.5 py-2 text-[15px] text-red-600 hover:bg-sq-bg disabled:opacity-40"
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
      <div className="px-5 pb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-w-0 min-h-9 -ml-1 px-1 rounded-lg text-left flex items-center gap-1.5 hover:bg-sq-bg"
          onClick={() => setPickerOpen(true)}
          aria-label={customer ? `Клієнт: ${customer.name}` : 'Клієнт не вибраний — вибрати'}
        >
          {customer ? (
            <>
              <User size={24} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold truncate">{customer.name}</span>
                {customer.phone && <span className="block text-xs text-sq-muted truncate">{customer.phone}</span>}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-[15px] font-semibold text-sq-blue">
              <Plus size={20} />
              Клієнт
            </span>
          )}
        </button>
        <span className="text-xs text-sq-muted truncate">{staffName || '—'}</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-auto px-3 pb-2 select-none">
        {lines.length === 0 ? (
          <p className="text-[15px] text-sq-muted py-12 text-center">Додайте товар з каталогу</p>
        ) : (
          <ul>
            {lines.map((line) => {
              const selected = selectedUid === line.uid;
              const lineTotal = line.unit_price_cents * line.quantity;
              const compareTotal =
                line.compare_at_cents != null ? line.compare_at_cents * line.quantity : null;
              const caption = [line.variant_label, line.quantity > 1 ? `${line.quantity} × ${formatUah(line.unit_price_cents)}` : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={line.uid} className={`rounded-xl ${selected ? 'bg-sq-sidebar' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(line.uid)}
                    className={`w-full text-left px-2 min-h-[60px] py-2.5 flex gap-3 items-center transition-colors ${
                      selected ? '' : 'border-b border-sq-divider/70 hover:bg-sq-bg/60 rounded-xl'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-medium text-sq-text truncate">{line.product_name}</p>
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
                      <p className="text-[16px] font-medium tabular-nums">{formatUah(lineTotal)}</p>
                      {compareTotal != null && compareTotal > lineTotal && (
                        <p className="text-xs text-sq-muted line-through tabular-nums">
                          {formatUah(compareTotal)}
                        </p>
                      )}
                    </div>
                  </button>
                  {selected && !locked && (
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

      <div className="px-5 pt-4 pb-5 bg-sq-sidebar border-t border-sq-divider/70 space-y-2.5">
        <div className="flex justify-between text-[15px] text-sq-secondary">
          <span>
            {positions} {positions === 1 ? 'позиція' : positions >= 2 && positions <= 4 ? 'позиції' : 'позицій'}
          </span>
          <span className="tabular-nums">{formatUah(subtotal)}</span>
        </div>
        {discountCents > 0 && (
          <div className="flex justify-between text-[15px] text-sq-secondary">
            <span>Знижка на чек</span>
            <span className="tabular-nums">−{formatUah(discountCents)}</span>
          </div>
        )}
        {!locked && (
          <button
            type="button"
            className="text-sq-blue text-[13px] font-semibold"
            onClick={() => setDiscountOpen(true)}
          >
            {cartDiscount ? 'Змінити знижку на чек' : 'Знижка на чек'}
          </button>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-[20px] font-bold text-sq-heading">До сплати</span>
          <span className="text-[28px] font-bold text-sq-heading tabular-nums">{formatUah(total)}</span>
        </div>
        <div className="flex gap-2.5 pt-1">
          {/*
            A promise is paid or put back — never parked, never discounted. The
            shop already named this number; the only questions left are «платимо»
            and «повертаємо на потім».
          */}
          {locked ? (
            <button
              type="button"
              onClick={onCancelPreorder}
              className="min-h-[52px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px]"
              data-testid="preorder-put-back"
            >
              Повернути
            </button>
          ) : lines.length === 0 ? (
            <button
              type="button"
              disabled={!onOpenParked}
              onClick={onOpenParked}
              className="min-h-[52px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] disabled:opacity-40"
              data-testid="open-parked"
            >
              Відкладені{parkedCount > 0 ? ` (${parkedCount})` : ''}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSaveBasket}
              className="min-h-[52px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] disabled:opacity-40"
              data-testid="park-cart"
            >
              Відкласти
            </button>
          )}
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={onCharge}
            aria-label={`Оплатити ${formatUah(total)}`}
            className="pos-btn-primary flex-1 min-h-[52px] !rounded-xl text-[17px]"
          >
            Оплатити
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
