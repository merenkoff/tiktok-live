// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ProductPhotoField } from '@pos/platform/ui';
import { DishFactsFields } from './DishFactsFields';
import { captionClass } from './formStyles';
import { compositionHint, SHAPE_OPTIONS, type ProductShape } from '../lib/productShape';
import type { ProductDraft } from '../lib/productDraft';

type Fields = Pick<ProductDraft, 'name' | 'description' | 'composition' | 'allergens' | 'imageUrl' | 'shape'>;

/**
 * The card's main column: what the product IS — photo, name, description, its
 * shape, and for a kitchen the words the guest reads. The same fields in the
 * same order whether the card is new or old.
 */
export function ProductFields({
  value,
  onPatch,
  showShape,
  showDishFacts,
}: {
  value: Fields;
  onPatch: (patch: Partial<Fields>) => void;
  /** Offer «Що це за товар» — a florist or a café, or a card that already is composite. */
  showShape: boolean;
  /** Ask for a dish's composition and allergens — a café, or a card that already holds them. */
  showDishFacts: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
      <ProductPhotoField value={value.imageUrl} onChange={(imageUrl) => onPatch({ imageUrl })} />
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Назва</span>
          <input
            className="sq-input"
            placeholder="Назва"
            value={value.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            required
          />
        </label>
        {/* Directly under the name on purpose: this choice decides what the
            rest of the card means (a derived composite has no opening stock, a
            composite needs a composition). Below the fold it was never found. */}
        {showShape && (
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className={captionClass}>Що це за товар</span>
              <select
                className="sq-input"
                value={value.shape}
                onChange={(e) => onPatch({ shape: e.target.value as ProductShape })}
              >
                {SHAPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {value.shape !== '' && (
              <p className="text-[13px] text-sq-muted">{compositionHint(value.shape)}</p>
            )}
          </div>
        )}
      </div>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className={captionClass}>Опис</span>
        <input
          className="sq-input"
          placeholder="Опис"
          value={value.description}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </label>
      {showDishFacts && (
        <DishFactsFields
          composition={value.composition}
          onComposition={(composition) => onPatch({ composition })}
          allergens={value.allergens}
          onAllergens={(allergens) => onPatch({ allergens })}
        />
      )}
    </div>
  );
}
