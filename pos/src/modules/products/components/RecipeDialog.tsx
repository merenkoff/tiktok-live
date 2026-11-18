// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uahInputToCents } from '@pos/platform';
import type { Product, ProductComponentInput } from '@pos/platform';
import { Dialog } from './Dialog';
import { RecipeEditor, type RecipeSource } from './RecipeEditor';
import { captionClass } from './formStyles';
import { errorText } from './modifierInput';
import { foodCostPercent } from '../data/techCards';
import { ingredientOptions } from '../lib/ingredientOptions';
import { centsToInput } from '../lib/productDraft';
import { foodCostBps, recipeCost, type CostIndex } from '../lib/recipeCost';

interface SizeDraft {
  id: number;
  label: string;
  price: string;
  components: ProductComponentInput[];
}

function draftOf(product: Product): SizeDraft[] {
  return product.variants
    .filter((v) => v.is_active)
    .map((v) => ({
      id: v.id,
      label: v.label,
      price: centsToInput(v.price_cents),
      components: (v.components ?? []).map((c) => ({
        component_variant_id: c.component_variant_id,
        quantity: c.quantity,
      })),
    }));
}

/**
 * One dish's tech card, opened from «Техкарти» and saved from there.
 *
 * The page used to be a report whose every row led away to the product card,
 * three steps from the recipe. Here the recipe opens in place: a tab per
 * size, the same editor the card has, and the selling price beside it — so
 * «what if it cost 85» is typed and read, not calculated. Saving writes the
 * changed sizes and nothing else of the card.
 */
export function RecipeDialog({
  product,
  products,
  costs,
  maxDepth,
  units,
  targetBps,
  onProductChanged,
  onSaved,
  onClose,
}: {
  product: Product;
  products: readonly Product[];
  costs: CostIndex;
  /** How deep a recipe may hold recipes in this store's vertical. */
  maxDepth: number;
  units: readonly string[];
  targetBps: number | null;
  /** An ingredient was made or priced from here. */
  onProductChanged: (product: Product) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => draftOf(product), [product]);
  const [sizes, setSizes] = useState<SizeDraft[]>(initial);
  const [tab, setTab] = useState(initial[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const options = useMemo(
    () => ingredientOptions([...products], { excludeProductId: product.id, maxDepth }),
    [products, product.id, maxDepth]
  );
  const active = sizes.find((s) => s.id === tab) ?? sizes[0];
  const changed = sizes.filter((size, i) => JSON.stringify(size) !== JSON.stringify(initial[i]));
  const dirty = changed.length > 0;
  const sold = product.sellable !== false;

  const sources: RecipeSource[] = useMemo(() => {
    const out: RecipeSource[] = [];
    for (const size of sizes) {
      if (size.id !== active?.id && size.components.length > 0) {
        out.push({ key: `s${size.id}`, title: size.label || product.name, sibling: true, components: size.components });
      }
    }
    for (const other of products) {
      if (!other.is_active || other.id === product.id || other.kind !== 'composite') continue;
      for (const v of other.variants) {
        if (!v.is_active || !v.components?.length) continue;
        out.push({
          key: `v${v.id}`,
          title: v.label ? `${other.name} · ${v.label}` : other.name,
          sibling: false,
          components: v.components.map((c) => ({ component_variant_id: c.component_variant_id, quantity: c.quantity })),
        });
      }
    }
    return out;
  }, [sizes, active?.id, products, product.id, product.name]);

  function patch(id: number, next: Partial<SizeDraft>) {
    setSizes((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
    setError(null);
  }

  async function save() {
    if (busy || !dirty) return;
    for (const size of changed) {
      if (sold && uahInputToCents(size.price) <= 0) {
        setTab(size.id);
        setError('Вкажіть ціну продажу');
        return;
      }
      if (size.components.some((c) => c.quantity <= 0)) {
        setTab(size.id);
        setError('Вкажіть кількість у кожному рядку');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      for (const size of changed) {
        try {
          await api.updateVariant(size.id, {
            components: size.components,
            price_cents: uahInputToCents(size.price),
          });
        } catch (err) {
          setTab(size.id);
          throw err;
        }
      }
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Не вдалося зберегти рецепт'));
      setBusy(false);
    }
  }

  function requestClose() {
    if (dirty && !busy) setClosing(true);
    else onClose();
  }

  const figure = (size: SizeDraft): string => {
    if (size.components.length === 0) return 'немає рецепта';
    const bps = foodCostBps(recipeCost(costs, size.components, size.id), uahInputToCents(size.price));
    return bps == null ? 'собівартість невідома' : foodCostPercent(bps);
  };

  if (!active) return null;

  return (
    <Dialog
      title={product.name}
      description={
        product.stock_mode === 'derived'
          ? 'Збирається, коли продається: продаж списує ці складники зі складу.'
          : 'Робиться наперед: складники списує документ «Виробництво».'
      }
      size="lg"
      onClose={requestClose}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      testId="recipe-dialog"
      footer={
        closing ? (
          <>
            <span className="mr-auto text-[15px] text-sq-text">Закрити без збереження?</span>
            <button type="button" className="sq-btn-quiet" onClick={() => setClosing(false)}>
              Ні, повернутись
            </button>
            <button
              type="button"
              className="min-h-11 px-4 rounded-sq text-[15px] font-semibold text-red-600 hover:bg-red-50"
              onClick={onClose}
              data-testid="recipe-dialog-discard"
            >
              Закрити
            </button>
          </>
        ) : (
          <>
            <Link
              to={`/admin/products/${product.id}`}
              className="mr-auto min-h-11 px-2 inline-flex items-center text-[15px] font-semibold text-sq-blue"
            >
              Відкрити картку
            </Link>
            <button type="button" className="sq-btn-quiet" onClick={requestClose}>
              Скасувати
            </button>
            <button
              type="submit"
              className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px] disabled:opacity-50"
              disabled={busy || !dirty}
              data-testid="recipe-dialog-save"
            >
              {busy ? 'Збереження…' : 'Зберегти'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4 pb-3">
        {error && (
          <div className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert" data-testid="recipe-dialog-error">
            {error}
          </div>
        )}

        {sizes.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Розмір">
            {sizes.map((size) => {
              const on = size.id === active.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(size.id)}
                  data-testid={`recipe-dialog-tab-${size.id}`}
                  className={`min-h-11 px-3.5 rounded-[10px] text-left ${
                    on
                      ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue'
                      : 'bg-sq-surface ring-1 ring-inset ring-sq-divider hover:bg-sq-sidebar'
                  }`}
                >
                  <span className={`block text-[15px] ${on ? 'font-semibold text-sq-blue' : 'font-medium text-sq-text'}`}>
                    {size.label || 'Варіант'}
                  </span>
                  <span className="block text-[12px] text-sq-muted tabular-nums">{figure(size)}</span>
                </button>
              );
            })}
          </div>
        )}

        {sold && (
          <label className="flex flex-col gap-1.5 max-w-[14rem]">
            <span className={captionClass}>Ціна продажу, грн</span>
            <input
              className="sq-input tabular-nums"
              inputMode="decimal"
              value={active.price}
              onChange={(e) => patch(active.id, { price: e.target.value })}
              data-testid="recipe-dialog-price"
            />
          </label>
        )}

        <RecipeEditor
          key={active.id}
          value={active.components}
          options={options}
          onChange={(components) => patch(active.id, { components })}
          money={{
            index: costs,
            priceCents: uahInputToCents(active.price),
            targetBps,
            selfId: active.id,
            onSetCost: async (variantId, baseMilli) => {
              onProductChanged(await api.updateVariant(variantId, { cost_milli: baseMilli }));
            },
          }}
          create={{ units, onCreated: onProductChanged }}
          sources={sources}
          emptyText="Рецепт порожній. Додайте складники — без них собівартість невідома."
        />
      </div>
    </Dialog>
  );
}
