// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState, type FormEvent } from 'react';
import { uahInputToCents } from '@pos/platform';
import type { VerticalPublicConfig } from '@pos/platform';
import { AttributeFields } from '@pos/platform/ui';
import { CompositionEditor } from './CompositionEditor';
import { Dialog } from './Dialog';
import { GenerateBarcodeButton } from './GenerateBarcodeButton';
import { PackFields } from './PackFields';
import { TechCardLine } from './TechCardLine';
import { VariantDiscountEditor } from './VariantDiscountEditor';
import type { ComponentOption } from './componentOptions';
import { captionClass } from './formStyles';
import { canonicalColour, type ColourUse } from './variantMatrix';
import type { TechCardRow } from '../data/techCardsApi';
import { centsToInput, rowName, type VariantDraft } from '../lib/productDraft';
import type { ProductShape } from '../lib/productShape';

/**
 * One variant, every field, in a sheet: the table on the card keeps the daily
 * ones in place and this holds the rest — the markdown, the purchase price,
 * the pack, the attributes, and for a composite its recipe. It edits a LOCAL
 * copy: «Готово» hands it to the card's draft (saved with the card's own
 * «Зберегти»), the X throws it away. Nothing here touches the server.
 */
export function VariantSheet({
  variant,
  shape,
  vertical,
  colours,
  partOptions,
  techCard,
  onApply,
  onArchive,
  onClose,
}: {
  variant: VariantDraft;
  shape: ProductShape;
  vertical: VerticalPublicConfig;
  /** The store's colours, most used first — a typed colour folds into their spelling. */
  colours: ColourUse[];
  partOptions: ComponentOption[];
  techCard?: TechCardRow;
  onApply: (next: VariantDraft) => void;
  /** Called with the edited copy, so a cancelled confirmation loses nothing typed here. */
  onArchive: (next: VariantDraft) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<VariantDraft>(variant);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<VariantDraft>) => setLocal((prev) => ({ ...prev, ...patch }));

  const composite = shape !== '';
  const colourSpec = vertical.attributes.find((a) => a.key === 'color' && a.type === 'text');
  const otherSchema = colourSpec ? vertical.attributes.filter((a) => a.key !== 'color') : vertical.attributes;
  const colourValue = local.attributes.color == null ? '' : String(local.attributes.color);

  function setColour(raw: string) {
    const next = { ...local.attributes };
    if (raw === '') delete next.color;
    else next.color = raw;
    set({ attributes: next });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (uahInputToCents(local.price) <= 0) {
      setError('Вкажіть ціну');
      return;
    }
    onApply(local);
  }

  return (
    <Dialog
      title={rowName(variant)}
      description="Зміни потраплять у картку після «Готово» і збережуться кнопкою «Зберегти»."
      onClose={onClose}
      onSubmit={submit}
      testId="variant-sheet"
      footer={
        <>
          <button
            type="button"
            onClick={() => onArchive(local)}
            className="mr-auto min-h-11 px-2 text-[15px] font-semibold text-red-600 hover:bg-red-50 rounded-lg"
          >
            Архівувати варіант
          </button>
          <button type="button" onClick={onClose} className="sq-btn-quiet">
            Скасувати
          </button>
          <button type="submit" className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]">
            Готово
          </button>
        </>
      }
    >
      <div className="space-y-5 py-1">
        {composite && (
          <section className="space-y-2 pb-4 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
            <p className={captionClass}>Склад</p>
            <CompositionEditor
              value={local.components}
              options={partOptions}
              onChange={(components) => set({ components })}
            />
            <TechCardLine card={techCard} />
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {colourSpec && (
            <label className="flex flex-col gap-1.5">
              <span className={captionClass}>{colourSpec.label}</span>
              <input
                className="sq-input"
                list="variant-sheet-colours"
                placeholder={colourSpec.placeholder ?? colourSpec.label}
                value={colourValue}
                onChange={(e) => setColour(e.target.value)}
                onBlur={(e) => {
                  const typed = e.target.value.trim();
                  if (typed) setColour(canonicalColour(typed, colours));
                }}
              />
              <datalist id="variant-sheet-colours">
                {colours.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </label>
          )}
          <AttributeFields
            className="contents"
            schema={otherSchema}
            value={local.attributes}
            onChange={(attributes) => set({ attributes })}
            unit={{ value: local.unit, options: vertical.units, onChange: (unit) => set({ unit }) }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Ціна, грн</span>
            <input
              className="sq-input tabular-nums"
              inputMode="decimal"
              placeholder="Ціна, грн"
              value={local.price}
              onChange={(e) => {
                setError(null);
                set({ price: e.target.value });
              }}
            />
            {error && <span className="text-sm text-red-600">{error}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Закупівельна ціна, грн</span>
            <input
              className="sq-input tabular-nums"
              inputMode="decimal"
              placeholder="Не вказано"
              value={local.cost}
              onChange={(e) => set({ cost: e.target.value })}
            />
          </label>
        </div>

        <VariantDiscountEditor
          priceCents={uahInputToCents(local.price)}
          compareAtCents={local.compareAtCents}
          onChange={(priceCents, compareAtCents) => set({ price: centsToInput(priceCents), compareAtCents })}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Артикул (SKU)</span>
            <input className="sq-input" value={local.sku} onChange={(e) => set({ sku: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Штрихкод</span>
            <div className="flex gap-2">
              <input
                className="sq-input tabular-nums min-w-0"
                inputMode="numeric"
                value={local.barcode}
                onChange={(e) => set({ barcode: e.target.value })}
              />
              <GenerateBarcodeButton onGenerated={(barcode) => set({ barcode })} />
            </div>
          </label>
        </div>

        <PackFields qty={local.pack.qty} label={local.pack.label} unit={local.unit} onChange={(pack) => set({ pack })} />

        <p className="text-[13px] text-sq-muted">
          {shape === 'derived' ? 'Можна зібрати' : 'Залишок'}:{' '}
          <span className="tabular-nums text-sq-secondary">
            {local.quantity} {local.unit}
          </span>
          {shape === 'derived' ? ' — рахується зі складників' : ' — змінюється документами складу'}
        </p>
      </div>
    </Dialog>
  );
}
