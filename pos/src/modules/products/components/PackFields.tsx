// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { packOf, packHint } from '@pos/platform';

/**
 * How this variant ARRIVES, as opposed to how it is counted (migration 054).
 *
 * Deliberately its own block rather than a field inside `AttributeFields`:
 * that component draws the unit selector only where the vertical offers a
 * choice of units, so in a clothing shop the pack would have vanished along
 * with it — and a boutique that buys T-shirts in boxes of twelve has exactly
 * the same problem a café has with oil.
 *
 * Both halves or neither: the server refuses half a pair, so the hint below
 * the inputs is what tells the owner the pair is complete before they save.
 */
export function PackFields({
  qty,
  label,
  unit,
  onChange,
  className = '',
}: {
  /** Raw input text — base units in one pack. */
  qty: string;
  /** Raw input text — what the pack is called. */
  label: string;
  /** The variant's base unit, so the caption can say «скільки мл». */
  unit: string;
  onChange: (next: { qty: string; label: string }) => void;
  className?: string;
}) {
  const pack = packOf({ pack_qty: Number(qty) || null, pack_label: label });
  const half = (qty.trim() !== '') !== (label.trim() !== '');

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="sq-section-label">Фасування — як товар приходить</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sq-secondary">
            Скільки {unit || 'одиниць'} в упаковці
          </span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="1000"
            className="sq-input tabular-nums"
            value={qty}
            onChange={(e) => onChange({ qty: e.target.value, label })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sq-secondary">Як зветься упаковка</span>
          <input
            placeholder="пляшка"
            maxLength={32}
            className="sq-input"
            value={label}
            onChange={(e) => onChange({ qty, label: e.target.value })}
          />
        </label>
      </div>
      <p className={`text-[13px] ${half ? 'text-amber-700' : 'text-sq-muted'}`}>
        {pack
          ? `${packHint(1, 'pack', pack, unit)}. Склад і далі рахується в ${unit || 'одиницях'} — упаковка лише полегшує введення приходу.`
          : half
            ? 'Заповніть обидва поля або залиште обидва порожніми.'
            : 'Не обовʼязково. Заповніть, якщо товар приходить упаковками — тоді прихід можна вводити в них.'}
      </p>
    </div>
  );
}
