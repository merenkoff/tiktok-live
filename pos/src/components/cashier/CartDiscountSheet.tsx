// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import type { CartDiscount } from '@pos/platform';
import { uahInputToCents } from '../../lib/money';
import { Percent, X } from '../../platform/glyphs';

interface Props {
  current: CartDiscount | null;
  onClose: () => void;
  onApply: (discount: CartDiscount | null) => void;
}

/**
 * «Знижка на чек» — one sheet for the till's receipt column and the phone's
 * cart: a bottom sheet on a narrow screen, a centred card on a wide one. Per
 * cent or a sum; only lines without a product discount of their own take it.
 */
export function CartDiscountSheet({ current, onClose, onApply }: Props) {
  const [type, setType] = useState<'percent' | 'fixed'>(current?.type ?? 'percent');
  const [value, setValue] = useState(
    current ? (current.type === 'percent' ? String(current.value) : (current.value / 100).toFixed(2).replace('.', ',')) : ''
  );

  function apply() {
    if (type === 'percent') {
      const pct = Math.round(Number(value.replace(',', '.')));
      if (!Number.isFinite(pct) || pct <= 0) return;
      onApply({ type: 'percent', value: Math.min(100, pct) });
    } else {
      const cents = uahInputToCents(value);
      if (cents <= 0) return;
      onApply({ type: 'fixed', value: cents });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(28,32,38,.32)]"
        onClick={onClose}
        aria-label="Закрити"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Знижка на чек"
        className="relative w-full sm:max-w-[400px] bg-white rounded-t-card sm:rounded-card shadow-[0_24px_60px_rgba(0,20,60,.28)] px-5 pb-5 pt-2 sm:pt-4 animate-fade-up"
        data-testid="cart-discount-sheet"
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2 sm:hidden" />
        <div className="flex items-center gap-2.5">
          <Percent size={24} />
          <h3 className="flex-1 text-[19px] font-bold text-sq-heading">Знижка на чек</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
            aria-label="Закрити вікно"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-sq-muted">Лише на позиції без товарної знижки</p>

        <div className="mt-4 flex gap-1 p-[3px] rounded-xl bg-sq-empty" role="group" aria-label="Тип знижки">
          {(['percent', 'fixed'] as const).map((t) => {
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setType(t)}
                className={`flex-1 min-h-10 rounded-[9px] text-[15px] transition-colors ${
                  on
                    ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                    : 'font-medium text-sq-secondary hover:text-sq-text'
                }`}
              >
                {t === 'percent' ? 'Відсоток, %' : 'Сума, ₴'}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 h-14 rounded-xl bg-sq-empty px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-sq-blue transition-colors">
          <input
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[22px] font-semibold text-sq-heading tabular-nums placeholder:text-sq-muted placeholder:font-normal"
            inputMode="decimal"
            autoFocus
            aria-label={type === 'percent' ? 'Знижка, %' : 'Знижка, грн'}
            placeholder={type === 'percent' ? 'Напр. 10' : 'Сума, грн'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
            }}
            data-testid="cart-discount-value"
          />
          <span className="text-[22px] font-semibold text-sq-muted">{type === 'percent' ? '%' : '₴'}</span>
        </label>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            className="flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text hover:bg-sq-sidebar"
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            Скинути
          </button>
          <button type="button" className="pos-btn-primary flex-[2] min-h-[52px] rounded-xl text-[17px]" onClick={apply}>
            Застосувати
          </button>
        </div>
      </div>
    </div>
  );
}
