// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { api, uahInputToCents } from '@pos/platform';
import type { Product } from '@pos/platform';
import { Segmented } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { captionClass } from './formStyles';
import { errorText } from './modifierInput';
import { humanPriceToBaseMilli, pricingUnit } from '../lib/recipeCost';
import { parseLossPercent } from '../lib/recipeLoss';

/** How a unit is offered: what it is counted in, and what the price is asked per. */
function unitChoice(unit: string): string {
  if (unit === 'г') return 'Грами (ціна за кг)';
  if (unit === 'мл') return 'Мілілітри (ціна за л)';
  if (unit === 'шт') return 'Штуки';
  return unit;
}

/**
 * A missing ingredient, made without leaving the recipe.
 *
 * The owner types «вершки 33» into a recipe line, nothing matches, and the
 * choice used to be: leave the dish, make a product, switch «продається на
 * касі» off, come back and find the line again. Here it is three fields. The
 * ingredient is an ordinary product that is not sold by itself — it shows in
 * «Товари», in the stock and in every other recipe from now on.
 */
export function NewIngredientDialog({
  name: initialName,
  units,
  onCreated,
  onClose,
}: {
  name: string;
  /** The units the store's vertical may count in. */
  units: readonly string[];
  /** The product as the server made it; its first variant is the ingredient. */
  onCreated: (product: Product) => void;
  onClose: () => void;
}) {
  const choices = units.length > 0 ? units : ['шт'];
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState(choices.includes('г') ? 'г' : choices[0]);
  const [price, setPrice] = useState('');
  const [loss, setLoss] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { label } = pricingUnit(unit);
  const humanCents = uahInputToCents(price);
  // To the kopeck per kilogram or litre: thousandths of a kopeck per base unit.
  const baseMilli = humanPriceToBaseMilli(humanCents, unit);

  async function submit() {
    if (busy) return;
    if (name.trim() === '') {
      setError('Вкажіть назву');
      return;
    }
    const lossBps = parseLossPercent(loss);
    if (lossBps == null) {
      setError('Відходи — від 0 до 99 %');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProduct({
        name: name.trim(),
        sellable: false,
        variants: [
          {
            attributes: {},
            unit,
            price_cents: 0,
            cost_milli: baseMilli,
            // Said only when it is: an empty box is «not said», not «0 %».
            ...(loss.trim() === '' ? {} : { prep_loss_bps: lossBps }),
          },
        ],
      });
      onCreated(created);
    } catch (err) {
      setError(errorText(err, 'Не вдалося створити інгредієнт'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Новий інгредієнт"
      description="Товар, який не продається сам: його бачать склад і рецепти, а екран продажу — ні."
      size="sm"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      testId="new-ingredient-dialog"
      footer={
        <>
          <button type="button" className="sq-btn-quiet" onClick={onClose}>
            Скасувати
          </button>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
            disabled={busy}
            data-testid="new-ingredient-save"
          >
            {busy ? 'Створюємо…' : 'Створити'}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-3">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
            {error}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Назва</span>
          <input
            className="sq-input"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            data-testid="new-ingredient-name"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={captionClass}>У чому рахуємо</span>
          <Segmented
            ariaLabel="Одиниця"
            className="w-full"
            value={unit}
            options={choices.map((u) => ({ value: u, label: unitChoice(u), testId: `new-ingredient-unit-${u}` }))}
            onChange={setUnit}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Ціна закупівлі за 1 {label}, грн</span>
          <input
            className="sq-input tabular-nums"
            inputMode="decimal"
            placeholder="Можна вказати пізніше"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            data-testid="new-ingredient-price"
          />
          <span className="text-[13px] text-sq-muted">
            Без ціни собівартість страви буде «невідома» — її перепише перший прихід з ціною.
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Відходи при обробці, %</span>
          <input
            className="sq-input tabular-nums"
            inputMode="decimal"
            placeholder="Якщо є: шкірка, кістки"
            value={loss}
            onChange={(e) => setLoss(e.target.value)}
            data-testid="new-ingredient-loss"
          />
          <span className="text-[13px] text-sq-muted">
            Підставиться в рецепт: впишете нетто — брутто порахується само.
          </span>
        </label>
      </div>
    </Dialog>
  );
}
