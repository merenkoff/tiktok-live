// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState, type FormEvent } from 'react';
import { api, uahInputToCents } from '@pos/platform';
import type { Product, VerticalPublicConfig } from '@pos/platform';
import { Dialog } from './Dialog';
import { NewVariantFields } from './NewVariantFields';
import { VariantMatrix, type MatrixResult } from './VariantMatrix';
import type { ComponentOption } from './componentOptions';
import { supportsMatrix, type ColourUse } from '../lib/variantMatrix';
import { emptyVariant, newVariantInput, type NewVariantValues } from '../lib/newVariant';
import { batchErrorMessage } from '../lib/saveErrors';
import type { VariantDraft } from '../lib/productDraft';
import type { ProductShape } from '../lib/productShape';

/**
 * Adds variants to an existing card — a size × colour matrix for a garment,
 * the one-variant fields for everything else. The one dialog on the card that
 * writes to the server itself: a variant is a row the server issues an id for,
 * so it is created on the spot, and the card merges the answer in while every
 * row the owner already has open keeps what was typed into it.
 */
export function AddVariantsDialog({
  productId,
  vertical,
  colours,
  existing,
  shape,
  partOptions,
  onAdded,
  onClose,
}: {
  productId: number;
  vertical: VerticalPublicConfig;
  colours: ColourUse[];
  /** The card's current variants: a cell that is already there is listed as «вже є», never created twice. */
  existing: ReadonlyArray<VariantDraft>;
  shape: ProductShape;
  partOptions: ComponentOption[];
  onAdded: (updated: Product) => void;
  onClose: () => void;
}) {
  // A garment is one card with a dozen variants, so a vertical with both colour
  // and size fills them as a matrix; every other vertical (and a composite,
  // which the matrix cannot compose) keeps the one-variant form.
  const useMatrix = supportsMatrix(vertical.attributes) && shape === '';
  const [matrix, setMatrix] = useState<MatrixResult | null>(null);
  const [single, setSingle] = useState<NewVariantValues>(() => emptyVariant(vertical.defaultUnit));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const count = useMatrix ? (matrix?.variants.length ?? 0) : 0;
  const label = useMatrix ? (count > 0 ? `Додати варіантів: ${count}` : 'Додати варіанти') : 'Додати варіант';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (useMatrix) {
      if (!matrix || matrix.problem || matrix.variants.length === 0) {
        setError(matrix?.problem ?? 'Оберіть кольори й розміри');
        return;
      }
    } else if (uahInputToCents(single.price) <= 0) {
      setError('Вкажіть ціну');
      return;
    }
    setBusy(true);
    try {
      const updated = useMatrix
        ? await api.addVariants(productId, matrix!.variants)
        : await api.addVariant(productId, newVariantInput(single, shape));
      onAdded(updated);
    } catch (err) {
      setError(batchErrorMessage(err, useMatrix ? 'Не вдалося додати варіанти' : 'Не вдалося додати варіант'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Додати варіанти"
      description={
        useMatrix
          ? 'Оберіть кольори й розміри — кожна комбінація стане варіантом. Те, що вже є на картці, не дублюється.'
          : undefined
      }
      size={useMatrix ? 'lg' : 'md'}
      onClose={onClose}
      onSubmit={submit}
      testId="add-variants-dialog"
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="button" onClick={onClose} className="sq-btn-quiet">
            Скасувати
          </button>
          <button type="submit" disabled={busy} className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]">
            {busy ? 'Додаємо…' : label}
          </button>
        </>
      }
    >
      <div className="py-1">
        {useMatrix ? (
          <VariantMatrix
            unit={vertical.defaultUnit}
            vocabulary={colours}
            existing={existing}
            autoBarcode={vertical.autoBarcode === true}
            onChange={setMatrix}
          />
        ) : (
          <NewVariantFields
            vertical={vertical}
            value={single}
            onChange={setSingle}
            shape={shape}
            partOptions={partOptions}
            compact
          />
        )}
      </div>
    </Dialog>
  );
}
