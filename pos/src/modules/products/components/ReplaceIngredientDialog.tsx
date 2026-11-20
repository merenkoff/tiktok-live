// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import type { Product } from '@pos/platform';
import { Dialog } from './Dialog';
import { IngredientPicker } from './IngredientPicker';
import type { ComponentOption } from './componentOptions';
import { captionClass, checkboxClass } from './formStyles';
import { errorText } from './modifierInput';
import { replaceIngredient, type ReplaceIngredientResult } from '../data/recipesApi';
import { plural } from '../lib/modifierWords';
import { unitPriceText, type CostIndex } from '../lib/recipeCost';
import { directUses, type IngredientRow } from '../lib/techCardLists';

/**
 * «Замінити в усіх рецептах» — the supplier changed, the cream is another
 * cream now, and it is in fourteen recipes.
 *
 * What other programs get wrong here is what this guards: the multiplier is
 * never empty (one tool zeroes every quantity when it is), the write is one
 * transaction that says beforehand how much it will touch, and it is undone
 * by the same action the other way round.
 */
export function ReplaceIngredientDialog({
  row,
  products,
  costs,
  options,
  onDone,
  onClose,
}: {
  row: IngredientRow;
  products: readonly Product[];
  costs: CostIndex;
  /** What it may be replaced with. */
  options: ComponentOption[];
  onDone: (result: ReplaceIngredientResult, toCaption: string) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState<number | null>(null);
  const [factor, setFactor] = useState('1');
  const [withModifiers, setWithModifiers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => options.filter((o) => o.variant_id !== row.variantId), [options, row.variantId]);
  const target = to == null ? null : (candidates.find((o) => o.variant_id === to) ?? null);
  const uses = useMemo(() => directUses(products, row.variantId), [products, row.variantId]);
  const k = Number(factor.trim().replace(',', '.'));
  const factorOk = Number.isFinite(k) && k > 0 && k <= 1000;
  const unitsDiffer = target != null && target.unit !== row.unit;
  const nothing = uses.recipes === 0 && (!withModifiers || row.modifierUses === 0);

  async function submit() {
    if (busy || to == null || !factorOk || nothing) return;
    setBusy(true);
    setError(null);
    try {
      const result = await replaceIngredient({
        from_variant_id: row.variantId,
        to_variant_id: to,
        factor: k,
        include_modifiers: withModifiers && row.modifierUses > 0,
      });
      onDone(result, target?.caption ?? '');
    } catch (err) {
      setError(errorText(err, 'Не вдалося замінити'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Замінити «${row.caption}»`}
      description="В усіх рецептах, де він є. Назад — тією самою дією навпаки."
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      testId="replace-ingredient-dialog"
      footer={
        <>
          <span className="mr-auto text-[14px] text-sq-secondary" data-testid="replace-preview">
            {uses.recipes > 0
              ? `Зміниться ${uses.recipes} ${plural(uses.recipes, ['рецепт', 'рецепти', 'рецептів'])}`
              : 'У рецептах його немає'}
            {withModifiers && row.modifierUses > 0
              ? ` і ${row.modifierUses} ${plural(row.modifierUses, ['відповідь', 'відповіді', 'відповідей'])} модифікаторів`
              : ''}
          </span>
          <button type="button" className="sq-btn-quiet" onClick={onClose}>
            Скасувати
          </button>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
            disabled={busy || to == null || !factorOk || nothing}
            data-testid="replace-save"
          >
            {busy ? 'Заміна…' : 'Замінити'}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-3">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert" data-testid="replace-error">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className={captionClass}>На що замінити</span>
          <IngredientPicker
            options={candidates}
            value={to}
            onChange={setTo}
            placeholder="Почніть набирати назву…"
            ariaLabel="На що замінити"
            noteOf={(option) => {
              const one = costs.get(option.variant_id);
              return one && one.costMilli > 0 ? unitPriceText(one.costMilli, option.unit) : option.unit;
            }}
            surface="page"
            testId="replace-to"
          />
        </div>
        <label className="flex flex-col gap-1.5 max-w-[14rem]">
          <span className={captionClass}>Помножити кількості на</span>
          <input
            className="sq-input tabular-nums"
            inputMode="decimal"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            data-testid="replace-factor"
          />
          {!factorOk && <span className="text-sm text-red-600">Вкажіть множник більший за нуль — порожнім він не буває</span>}
        </label>
        <p className={`text-[13px] leading-relaxed ${unitsDiffer ? 'text-amber-700' : 'text-sq-muted'}`}>
          {unitsDiffer
            ? `Одиниці різні: було в «${row.unit}», стане в «${target?.unit}». Число в рецепті лишиться тим самим, помноженим на множник, — перевірте його.`
            : '1 — кількості лишаються як є. Якщо нова заміна вже є в рецепті, кількості складуться.'}
        </p>
        {row.modifierUses > 0 && (
          <label className="inline-flex items-center gap-2 min-h-9 text-[15px] text-sq-text cursor-pointer">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={withModifiers}
              onChange={(e) => setWithModifiers(e.target.checked)}
              data-testid="replace-modifiers"
            />
            І у відповідях модифікаторів, що його списують
          </label>
        )}
      </div>
    </Dialog>
  );
}
