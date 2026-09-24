// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { ProductComponentInput } from '@pos/platform';
import { Plus } from '@pos/platform/ui';
import type { ComponentOption } from './componentOptions';

/**
 * The composition of one composite variant — what one bouquet is made of.
 *
 * Edited as a whole and saved as a whole, like the attribute bag: the server
 * replaces the composition wholesale, so removing a component is expressible.
 */
export function CompositionEditor({
  value,
  options,
  onChange,
}: {
  value: ProductComponentInput[];
  options: ComponentOption[];
  onChange: (next: ProductComponentInput[]) => void;
}) {
  const [addId, setAddId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState('1');

  const byVariant = useMemo(
    () => new Map(options.map((option) => [option.variant_id, option])),
    [options]
  );
  const used = useMemo(() => new Set(value.map((row) => row.component_variant_id)), [value]);
  const available = options.filter((option) => !used.has(option.variant_id));

  function add() {
    const variantId = Number(addId);
    const quantity = Number(addQty);
    if (!variantId || !Number.isInteger(quantity) || quantity <= 0) return;
    onChange([...value, { component_variant_id: variantId, quantity }]);
    setAddId('');
    setAddQty('1');
  }

  return (
    <div className="space-y-1">
      <p className="text-[13px] font-semibold text-sq-secondary">Склад</p>

      {value.length === 0 && (
        <p className="py-2 text-[15px] text-sq-muted">
          Порожньо. Складений товар без складу продати не можна.
        </p>
      )}

      {value.map((row, idx) => {
        const option = byVariant.get(row.component_variant_id);
        return (
          <div
            key={row.component_variant_id}
            data-testid="composition-row"
            className="sq-row grid grid-cols-[1fr_8rem_auto] gap-2 items-center min-h-12 py-1"
          >
            <span className="text-[15px] text-sq-text truncate">
              {option?.caption ?? `Варіант ${row.component_variant_id}`}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                className="sq-input text-right tabular-nums"
                inputMode="numeric"
                aria-label="Кількість"
                value={String(row.quantity)}
                onChange={(e) => {
                  const next = [...value];
                  next[idx] = { ...row, quantity: Number(e.target.value.replace(/\D/g, '')) || 0 };
                  onChange(next);
                }}
              />
              <span className="w-6 text-[13px] text-sq-muted shrink-0">{option?.unit ?? ''}</span>
            </div>
            <button
              type="button"
              className="text-[15px] font-semibold text-red-600 min-h-11 px-2"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
            >
              Прибрати
            </button>
          </div>
        );
      })}

      <div className="grid grid-cols-[1fr_8rem_auto] gap-2 items-center pt-2">
        <select
          className="sq-input"
          aria-label="Складник"
          value={addId}
          onChange={(e) => setAddId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Оберіть складник…</option>
          {available.map((option) => (
            <option key={option.variant_id} value={option.variant_id}>
              {option.caption}
            </option>
          ))}
        </select>
        <div className="pr-[30px]">
          <input
            className="sq-input text-right tabular-nums"
            inputMode="numeric"
            aria-label="Кількість складника"
            value={addQty}
            onChange={(e) => setAddQty(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue min-h-11 px-2 disabled:opacity-40"
          onClick={add}
          disabled={addId === ''}
        >
          <Plus size={20} />
          Додати
        </button>
      </div>
    </div>
  );
}
