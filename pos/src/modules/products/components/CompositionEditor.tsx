// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { ProductComponentInput } from '@pos/platform';
import type { ComponentOption } from './componentOptions';

const fieldClass =
  'w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm ' +
  'text-sq-text placeholder:text-sq-muted focus:outline-none focus:border-sq-blue';

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
    <div className="space-y-2 rounded-sq border border-sq-divider bg-sq-bg/40 p-3">
      <p className="text-xs font-semibold text-sq-secondary">Склад</p>

      {value.length === 0 && (
        <p className="text-sm text-sq-muted">
          Порожньо. Складений товар без складу продати не можна.
        </p>
      )}

      {value.map((row, idx) => {
        const option = byVariant.get(row.component_variant_id);
        return (
          <div
            key={row.component_variant_id}
            data-testid="composition-row"
            className="grid grid-cols-[1fr_5rem_auto] gap-2 items-center"
          >
            <span className="text-sm text-sq-text truncate">
              {option?.caption ?? `Варіант ${row.component_variant_id}`}
            </span>
            <div className="flex items-center gap-1">
              <input
                className={fieldClass}
                inputMode="numeric"
                aria-label="Кількість"
                value={String(row.quantity)}
                onChange={(e) => {
                  const next = [...value];
                  next[idx] = { ...row, quantity: Number(e.target.value.replace(/\D/g, '')) || 0 };
                  onChange(next);
                }}
              />
              <span className="text-xs text-sq-muted shrink-0">{option?.unit ?? ''}</span>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-red-600 min-h-11 px-2"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
            >
              Прибрати
            </button>
          </div>
        );
      })}

      <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-center pt-1 border-t border-sq-divider">
        <select
          className={fieldClass}
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
        <input
          className={fieldClass}
          inputMode="numeric"
          aria-label="Кількість складника"
          value={addQty}
          onChange={(e) => setAddQty(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="button"
          className="text-sm font-semibold text-sq-blue min-h-11 px-2"
          onClick={add}
          disabled={addId === ''}
        >
          + Додати
        </button>
      </div>
    </div>
  );
}
