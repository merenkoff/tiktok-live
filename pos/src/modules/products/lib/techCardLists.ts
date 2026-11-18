// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Техкарти» as three lists read off the catalogue the page already holds:
// what is SOLD (with what it costs and whether that figure can be trusted),
// what is PREPARED to go into dishes, and what is BOUGHT — each ingredient
// with where it is used, so a price that moved is followed to the dishes it
// moves. Pure: the page, its filters and the sidebar's count all read these.

import type { ModifierGroup, Product } from '@pos/platform';
import { costMilliOf } from '../../../lib/costUnits';
import { foodCostBps, recipeCost, type CostIndex, type RecipeCost } from './recipeCost';

/** Why a dish's cost cannot be acted on — or that it loses money. */
export type DishProblem = 'empty' | 'unpriced' | 'loss';

export interface SizeRow {
  variantId: number;
  /** «M», or «» for a dish with one size. */
  label: string;
  priceCents: number;
  cost: RecipeCost;
  /** Null when it cannot be told honestly — the screen says «—» and why, never 0 %. */
  bps: number | null;
  problem: DishProblem | null;
}

export interface DishRow {
  productId: number;
  name: string;
  tagIds: number[];
  /** Made in advance (a production document takes its parts) rather than when it sells. */
  madeAhead: boolean;
  sizes: SizeRow[];
  problems: DishProblem[];
  /** The worst size's food cost; null when no size has an honest one. */
  worstBps: number | null;
}

function sizeRow(index: CostIndex, variant: Product['variants'][number]): SizeRow {
  const components = (variant.components ?? []).map((c) => ({
    component_variant_id: c.component_variant_id,
    quantity: c.quantity,
  }));
  const cost = recipeCost(index, components, variant.id);
  const bps = foodCostBps(cost, variant.price_cents);
  const problem: DishProblem | null =
    components.length === 0 ? 'empty' : cost.unpriced ? 'unpriced' : bps != null && bps >= 10000 ? 'loss' : null;
  return { variantId: variant.id, label: variant.label, priceCents: variant.price_cents, cost, bps, problem };
}

function recipeRows(products: readonly Product[], index: CostIndex, sold: boolean): DishRow[] {
  const rows: DishRow[] = [];
  for (const product of products) {
    if (!product.is_active || product.kind !== 'composite') continue;
    if ((product.sellable !== false) !== sold) continue;
    const sizes = product.variants.filter((v) => v.is_active).map((v) => sizeRow(index, v));
    if (sizes.length === 0) continue;
    const known = sizes.map((s) => s.bps).filter((bps): bps is number => bps != null);
    rows.push({
      productId: product.id,
      name: product.name,
      tagIds: product.tag_ids,
      madeAhead: product.stock_mode !== 'derived',
      sizes,
      problems: [...new Set(sizes.map((s) => s.problem).filter((p): p is DishProblem => p != null))],
      worstBps: known.length > 0 ? Math.max(...known) : null,
    });
  }
  return sortWorstFirst(rows);
}

/**
 * Worst first: the dishes eating the most of their own price at the top, the
 * ones with no honest figure after them (among themselves by name) — «unknown»
 * is not a place on a list of the worst offenders.
 */
export function sortWorstFirst(rows: DishRow[]): DishRow[] {
  return [...rows].sort((a, b) => {
    if (a.worstBps == null && b.worstBps == null) return a.name.localeCompare(b.name, 'uk');
    if (a.worstBps == null) return 1;
    if (b.worstBps == null) return -1;
    return b.worstBps - a.worstBps || a.name.localeCompare(b.name, 'uk');
  });
}

/** What the store sells that has a recipe. */
export function dishRows(products: readonly Product[], index: CostIndex): DishRow[] {
  return recipeRows(products, index, true);
}

/** Recipes that are not sold by themselves — a sauce, a stock: they go into dishes. */
export function prepRows(products: readonly Product[], index: CostIndex): DishRow[] {
  return recipeRows(products, index, false);
}

/** What is sold with NO recipe: nothing is written off for it and its cost is unknown. */
export function noRecipeProducts(products: readonly Product[]): Product[] {
  return products
    .filter((p) => p.is_active && p.kind !== 'composite' && p.sellable !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

/** A cost that cannot be trusted, or a dish sold at a loss — what the sidebar counts. */
export function needsAttention(row: DishRow): boolean {
  return row.problems.length > 0;
}

export function overTarget(row: DishRow, targetBps: number | null): boolean {
  return targetBps != null && row.worstBps != null && row.worstBps > targetBps && row.worstBps < 10000;
}

export const PROBLEM_TEXT: Record<DishProblem, string> = {
  empty: 'немає рецепта',
  unpriced: 'немає ціни складника',
  loss: 'дорожче за ціну',
};

/** One thing the store buys, with where it goes. */
export interface IngredientRow {
  variantId: number;
  productId: number;
  caption: string;
  unit: string;
  /** Per one base unit, thousandths of a kopeck (`lib/costUnits.ts`); 0 = never received with a price. */
  costMilli: number;
  /** On the shelf, in base units. */
  quantity: number;
  /** The dishes and preps whose recipes take it — directly or through a prep. */
  usedIn: { productId: number; name: string }[];
  /** How many modifier answers write it off. */
  modifierUses: number;
}

/** The shelves one variant's recipe takes from, folded the way the cost walk folds it. */
function leavesOf(index: CostIndex, variantId: number, seen: Set<number>, out: Set<number>): void {
  const node = index.get(variantId);
  if (!node) return;
  for (const part of node.components) {
    const child = index.get(part.component_variant_id);
    out.add(part.component_variant_id);
    if (child?.derived && !seen.has(child.variantId)) {
      seen.add(child.variantId);
      leavesOf(index, child.variantId, seen, out);
    }
  }
}

/**
 * Everything recipes and modifier answers take off the shelf, and every
 * product that is not sold by itself — unpriced first (they are what makes a
 * dish's cost unknown), then by name. A recipe assembled when it sells is not
 * an ingredient: it has no shelf of its own.
 */
export function ingredientRows(
  products: readonly Product[],
  index: CostIndex,
  groups: readonly ModifierGroup[] = []
): IngredientRow[] {
  const usedIn = new Map<number, Map<number, string>>();
  for (const product of products) {
    if (!product.is_active || product.kind !== 'composite') continue;
    for (const variant of product.variants) {
      if (!variant.is_active) continue;
      const leaves = new Set<number>();
      leavesOf(index, variant.id, new Set([variant.id]), leaves);
      for (const leaf of leaves) {
        const where = usedIn.get(leaf) ?? new Map<number, string>();
        where.set(product.id, product.name);
        usedIn.set(leaf, where);
      }
    }
  }
  const modifierUses = new Map<number, number>();
  for (const group of groups) {
    for (const answer of group.modifiers) {
      if (answer.component_variant_id != null) {
        modifierUses.set(answer.component_variant_id, (modifierUses.get(answer.component_variant_id) ?? 0) + 1);
      }
    }
  }

  const rows: IngredientRow[] = [];
  for (const product of products) {
    if (!product.is_active) continue;
    for (const variant of product.variants) {
      if (!variant.is_active) continue;
      const node = index.get(variant.id);
      if (!node || node.derived) continue;
      const where = usedIn.get(variant.id);
      const inModifiers = modifierUses.get(variant.id) ?? 0;
      if (!where && inModifiers === 0 && product.sellable !== false) continue;
      rows.push({
        variantId: variant.id,
        productId: product.id,
        caption: node.caption,
        unit: variant.unit,
        costMilli: costMilliOf(variant),
        quantity: variant.quantity,
        usedIn: [...(where ?? new Map<number, string>()).entries()]
          .map(([productId, name]) => ({ productId, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
        modifierUses: inModifiers,
      });
    }
  }
  return rows.sort(
    (a, b) => Number(a.costMilli > 0) - Number(b.costMilli > 0) || a.caption.localeCompare(b.caption, 'uk')
  );
}

/** How many recipes a replacement would touch — the preview before the write. */
export function directUses(products: readonly Product[], variantId: number): { recipes: number; productIds: number[] } {
  let recipes = 0;
  const productIds = new Set<number>();
  for (const product of products) {
    if (!product.is_active) continue;
    for (const variant of product.variants) {
      if ((variant.components ?? []).some((c) => c.component_variant_id === variantId)) {
        recipes += 1;
        productIds.add(product.id);
      }
    }
  }
  return { recipes, productIds: [...productIds] };
}
