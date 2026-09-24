// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The product-variant attribute inputs, rendered from the store's vertical.
 *
 * Before verticals this was two hard-coded boxes labelled «Колір» and «Розмір»
 * in three places. A florist needs stem length and country; a café will need
 * something else again — so the schema comes from `store.vertical.attributes`
 * and the host just renders it. Whatever the operator types is validated
 * server-side against the same schema, and the variant's caption is derived
 * there too: nothing here composes one.
 */

import type { AttributeSpec, AttributeValues } from '../types';

const FIELD = 'sq-input';

export function AttributeFields({
  schema,
  value,
  onChange,
  unit,
  disabled,
  className = 'grid gap-3 sm:grid-cols-2',
}: {
  schema: AttributeSpec[];
  value: AttributeValues;
  onChange: (next: AttributeValues) => void;
  /** Rendered only when the vertical actually offers a choice of units. */
  unit?: { value: string; options: string[]; onChange: (next: string) => void };
  disabled?: boolean;
  className?: string;
}) {
  function set(key: string, raw: string): void {
    const next = { ...value };
    // An empty box means "not set" — the server drops it from the bag rather
    // than storing a blank, so the caption never gets a stray separator.
    if (raw === '') delete next[key];
    else next[key] = raw;
    onChange(next);
  }

  const showUnit = unit != null && unit.options.length > 1;
  if (schema.length === 0 && !showUnit) return null;

  return (
    <div className={className}>
      {schema.map((spec) => {
        const current = value[spec.key];
        const shown = current == null ? '' : String(current);
        const label = spec.unitSuffix ? `${spec.label}, ${spec.unitSuffix}` : spec.label;
        return (
          <label key={spec.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">
              {label}
              {spec.required && <span className="text-sq-danger"> *</span>}
            </span>
            {spec.type === 'select' ? (
              <select
                className={FIELD}
                value={shown}
                disabled={disabled}
                onChange={(e) => set(spec.key, e.target.value)}
              >
                <option value="">—</option>
                {(spec.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={FIELD}
                type={spec.type === 'number' ? 'number' : 'text'}
                inputMode={spec.type === 'number' ? 'decimal' : undefined}
                value={shown}
                disabled={disabled}
                placeholder={spec.placeholder ?? spec.label}
                onChange={(e) => set(spec.key, e.target.value)}
              />
            )}
          </label>
        );
      })}

      {showUnit && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">Одиниця</span>
          <select
            className={FIELD}
            value={unit.value}
            disabled={disabled}
            onChange={(e) => unit.onChange(e.target.value)}
          >
            {unit.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
