// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { uahInputToCents } from '@pos/platform';
import { captionClass } from './formStyles';

/**
 * A variant's own markdown: the price becomes the new one and the old one is
 * kept as `compare_at`, so the tag and the receipt can show both. Either by a
 * percentage or by naming the new price; «Скинути» puts the old price back.
 */
export function VariantDiscountEditor({
  priceCents,
  compareAtCents,
  onChange,
}: {
  priceCents: number;
  compareAtCents: number | null;
  onChange: (priceCents: number, compareAtCents: number | null) => void;
}) {
  const [pct, setPct] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const hasDiscount = compareAtCents != null && compareAtCents > priceCents;

  return (
    <div className="space-y-2">
      <p className={captionClass}>Знижка товару</p>
      {hasDiscount ? (
        <p className="text-[13px] text-sq-secondary tabular-nums">
          Стара: {(compareAtCents / 100).toFixed(2)} ₴ → нова: {(priceCents / 100).toFixed(2)} ₴
          <button
            type="button"
            className="ml-2 text-sq-blue font-semibold"
            onClick={() => onChange(compareAtCents, null)}
          >
            Скинути знижку
          </button>
        </p>
      ) : (
        <p className="text-[13px] text-sq-muted">Без знижки</p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="w-28">
          <input
            className="sq-input tabular-nums"
            placeholder="% знижки"
            aria-label="% знижки"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
          onClick={() => {
            const p = Number(pct);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) return;
            const base = compareAtCents ?? priceCents;
            const nextPrice = Math.round((base * (100 - p)) / 100);
            onChange(nextPrice, base);
            setPct('');
          }}
        >
          За %
        </button>
        <div className="w-36">
          <input
            className="sq-input tabular-nums"
            placeholder="Нова ціна, грн"
            aria-label="Нова ціна, грн"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
          onClick={() => {
            const next = uahInputToCents(newPrice);
            if (next <= 0 || next >= priceCents) return;
            const base = compareAtCents ?? priceCents;
            onChange(next, base);
            setNewPrice('');
          }}
        >
          За новою ціною
        </button>
      </div>
    </div>
  );
}
