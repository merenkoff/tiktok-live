// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { VerticalPublicConfig } from '@pos/platform';
import { AttributeFields } from '@pos/platform/ui';
import { CompositionEditor } from './CompositionEditor';
import type { ComponentOption } from './componentOptions';
import { GenerateBarcodeButton } from './GenerateBarcodeButton';
import { PackFields } from './PackFields';
import { captionClass } from './formStyles';
import { compositionHint, type ProductShape } from '../lib/productShape';
import type { NewVariantValues } from '../lib/newVariant';

/**
 * The one-variant field set — a florist's stem, a café's cup, anything the
 * size × colour matrix does not fit. Shared by the create page and the
 * «Додати варіанти» dialog so the two ask the same questions in the same order.
 */
export function NewVariantFields({
  vertical,
  value,
  onChange,
  shape,
  partOptions,
  compact,
}: {
  vertical: VerticalPublicConfig;
  value: NewVariantValues;
  onChange: (next: NewVariantValues) => void;
  shape: ProductShape;
  partOptions: ComponentOption[];
  /** Inside a dialog: one column, no two-column grid. */
  compact?: boolean;
}) {
  const grid = compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2';
  const set = (patch: Partial<NewVariantValues>) => onChange({ ...value, ...patch });

  return (
    <div className={`${grid} sm:col-span-2`}>
      <AttributeFields
        className={`${grid} sm:col-span-2`}
        schema={vertical.attributes}
        value={value.attributes}
        onChange={(attributes) => set({ attributes })}
        unit={{ value: value.unit, options: vertical.units, onChange: (unit) => set({ unit }) }}
      />
      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>Ціна, грн</span>
        <input
          className="sq-input tabular-nums"
          placeholder="Ціна, грн"
          inputMode="decimal"
          value={value.price}
          onChange={(e) => set({ price: e.target.value })}
          required
        />
      </label>
      {shape === 'derived' ? (
        <p className="text-[13px] text-sq-muted self-end pb-3">Залишок рахується зі складників.</p>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Залишок</span>
          <input
            className="sq-input tabular-nums"
            placeholder="Залишок"
            inputMode="numeric"
            value={value.qty}
            onChange={(e) => set({ qty: e.target.value })}
          />
        </label>
      )}
      {shape && (
        <div className="sm:col-span-2">
          <CompositionEditor
            value={value.components}
            options={partOptions}
            onChange={(components) => set({ components })}
          />
          <p className="text-[13px] text-sq-muted mt-1.5">{compositionHint(shape)}</p>
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>Артикул (SKU) — ваш внутрішній код</span>
        <input className="sq-input" value={value.sku} onChange={(e) => set({ sku: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>Штрихкод — те, що читає сканер</span>
        <div className="flex gap-2">
          <input
            className="sq-input tabular-nums min-w-0"
            value={value.barcode}
            onChange={(e) => set({ barcode: e.target.value })}
          />
          <GenerateBarcodeButton onGenerated={(barcode) => set({ barcode })} />
        </div>
      </label>
      <PackFields
        className="sm:col-span-2"
        qty={value.pack.qty}
        label={value.pack.label}
        unit={value.unit}
        onChange={(pack) => set({ pack })}
      />
    </div>
  );
}
