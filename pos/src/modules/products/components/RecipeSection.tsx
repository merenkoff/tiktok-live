// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState } from 'react';
import { uahInputToCents, useAuthStore } from '@pos/platform';
import type { Product, ProductComponentInput } from '@pos/platform';
import { Plus, SectionHead, Segmented } from '@pos/platform/ui';
import { RecipeEditor, type RecipeSource } from './RecipeEditor';
import type { ComponentOption } from './componentOptions';
import { foodCostPercent } from '../data/techCards';
import { useFoodCostTarget } from '../lib/foodCostTarget';
import { rowName, type ProductDraft, type VariantDraft } from '../lib/productDraft';
import { compositionHint, type ProductShape } from '../lib/productShape';
import { foodCostBps, recipeCost, type CostIndex } from '../lib/recipeCost';
import { recipeLineOf } from '../lib/recipeLoss';
import { recipeYieldOf } from '../lib/productDraft';
import { buildTechCardSheet } from '../lib/techCardSheet';
import { useTechCardPrint } from '../lib/useTechCardPrint';

/** Every recipe of the store this card could copy, by name. */
function otherRecipes(products: readonly Product[], productId: number): RecipeSource[] {
  const out: RecipeSource[] = [];
  for (const product of products) {
    if (!product.is_active || product.id === productId || product.kind !== 'composite') continue;
    for (const variant of product.variants) {
      if (!variant.is_active || !variant.components?.length) continue;
      out.push({
        key: `v${variant.id}`,
        title: variant.label ? `${product.name} · ${variant.label}` : product.name,
        sibling: false,
        components: variant.components.map(recipeLineOf),
      });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
}

/**
 * The dish's recipe, on the card itself.
 *
 * It used to sit three steps down — the variant's «⋯», a sheet, a block at
 * the top of it — and a dish in three sizes was three sheets. Here every size
 * is a tab, the recipe is a table with money beside each line, and a dish
 * that has none says so and offers one. What is typed is the card's own
 * draft: it is saved by the card's «Зберегти», in the order the server needs.
 */
export function RecipeSection({
  draft,
  productId,
  products,
  options,
  costs,
  units,
  dish,
  onPatchDraft,
  onPatchVariant,
  onProductCreated,
  onSetCost,
}: {
  draft: Pick<ProductDraft, 'name' | 'shape' | 'variants' | 'sellable'>;
  productId: number;
  products: readonly Product[];
  /** What may go into this card's recipes. */
  options: ComponentOption[];
  costs: CostIndex;
  /** The units a new ingredient may be counted in. */
  units: readonly string[];
  /** A café says «Рецепт», a florist «Склад». */
  dish: boolean;
  onPatchDraft: (patch: { shape: ProductShape }) => void;
  onPatchVariant: (variantId: number, patch: Partial<VariantDraft>) => void;
  /** An ingredient was made from the search: the catalogue grows by it. */
  onProductCreated: (product: Product) => void;
  onSetCost: (variantId: number, baseMilli: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<number | null>(null);
  const [target] = useFoodCostTarget();
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const { print, portal } = useTechCardPrint();
  const others = useMemo(() => otherRecipes(products, productId), [products, productId]);
  const title = dish ? 'Рецепт' : 'Склад';
  // «Додати рецепт» on «Техкарти» lands here: the card opens on this section.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === '#recipe') ref.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  if (draft.shape === '') {
    // A dish that is sold and has no recipe: nothing is written off for it and
    // its cost is unknown. Said once, with the one button that fixes it.
    return (
      <section ref={ref} id="recipe" className="space-y-3 scroll-mt-6" data-testid="recipe-section">
        <SectionHead title={title} />
        <p className="text-[15px] text-sq-muted leading-relaxed">
          {dish
            ? 'У страви немає рецепта: продаж нічого не списує зі складу, а собівартість невідома.'
            : 'Товар продається як є, без складників.'}
        </p>
        <button
          type="button"
          className="min-h-11 px-4 rounded-[10px] inline-flex items-center gap-1.5 text-[15px] font-semibold text-sq-blue ring-1 ring-inset ring-sq-divider bg-sq-surface hover:bg-sq-sidebar"
          onClick={() => onPatchDraft({ shape: 'derived' })}
          data-testid="recipe-start"
        >
          <Plus size={18} />
          {dish ? 'Додати рецепт' : 'Додати склад'}
        </button>
      </section>
    );
  }

  const variants = draft.variants;
  const active = variants.find((v) => v.id === tab) ?? variants[0];
  if (!active) return null;

  const siblings: RecipeSource[] = variants
    .filter((v) => v.id !== active.id && v.components.length > 0)
    .map((v) => ({ key: `s${v.id}`, title: rowName(v), sibling: true, components: v.components }));

  const figure = (v: VariantDraft): string => {
    if (v.components.length === 0) return 'немає рецепта';
    const bps = foodCostBps(
      recipeCost(costs, v.components, v.id, recipeYieldOf(v.recipeYield) ?? 1),
      uahInputToCents(v.price)
    );
    return bps == null ? 'собівартість невідома' : foodCostPercent(bps);
  };

  return (
    <section ref={ref} id="recipe" className="space-y-3 scroll-mt-6" data-testid="recipe-section">
      <SectionHead title={title} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<Exclude<ProductShape, ''>>
          ariaLabel="Коли збирається"
          value={draft.shape}
          options={[
            { value: 'derived', label: 'Збираємо, коли продаємо', testId: 'recipe-mode-derived' },
            { value: 'own', label: 'Робимо наперед', testId: 'recipe-mode-own' },
          ]}
          onChange={(shape) => onPatchDraft({ shape })}
        />
        <span className="text-[13px] text-sq-muted">{compositionHint(draft.shape)}</span>
      </div>

      {variants.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Розмір">
          {variants.map((v) => {
            const on = v.id === active.id;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(v.id)}
                data-testid={`recipe-tab-${v.id}`}
                className={`min-h-11 px-3.5 rounded-[10px] text-left ${
                  on
                    ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue'
                    : 'bg-sq-surface ring-1 ring-inset ring-sq-divider hover:bg-sq-sidebar'
                }`}
              >
                <span className={`block text-[15px] ${on ? 'font-semibold text-sq-blue' : 'font-medium text-sq-text'}`}>
                  {rowName(v)}
                </span>
                <span className="block text-[12px] text-sq-muted tabular-nums">{figure(v)}</span>
              </button>
            );
          })}
        </div>
      )}

      <RecipeEditor
        key={active.id}
        value={active.components}
        options={options}
        onChange={(components: ProductComponentInput[]) => onPatchVariant(active.id, { components })}
        money={{
          index: costs,
          priceCents: uahInputToCents(active.price),
          targetBps: target,
          selfId: active.id,
          onSetCost,
        }}
        create={{ units, onCreated: onProductCreated }}
        sources={[...siblings, ...others]}
        losses={dish}
        // A kitchen writes a semi-finished for a batch (migration 116).
        batch={
          dish
            ? {
                value: active.recipeYield ?? '',
                unit: active.unit,
                onChange: (recipeYield) => onPatchVariant(active.id, { recipeYield }),
              }
            : undefined
        }
        // What is on screen is what is printed — saved or not.
        onPrint={() =>
          print(
            buildTechCardSheet({
              store: storeName,
              title: draft.name.trim(),
              size: active.label,
              components: active.components,
              index: costs,
              batch: { amount: recipeYieldOf(active.recipeYield) ?? 1, unit: active.unit },
            })
          )
        }
        emptyText={
          dish
            ? 'Рецепт порожній. Додайте складники — без них страву не продати.'
            : 'Порожньо. Складений товар без складу продати не можна.'
        }
      />
      {portal}
    </section>
  );
}
