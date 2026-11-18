// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a recipe costs WHILE it is being typed — the server's sum
// (`sumUnitCost` / `listTechCards` in `src/pos/composites.service.ts`), done
// on the catalogue the page already holds, so the owner sees the money move
// with every line instead of after «Зберегти».
//
// The same rules, and they are the server's: a recipe inside a recipe that is
// assembled when it sells (`derived`) is folded down to the shelves it takes
// from; one made in advance (`own`) is a shelf of its own, at its own
// purchase price; and a shelf with no purchase price is «we do not know»,
// never «free» — the total then has no honest food cost.

import type { Product, ProductComponentInput } from '@pos/platform';
import {
  costMilliOf,
  costShareBps,
  milliToCents,
  milliToPrice,
  priceToMilli,
  pricingUnit,
} from '../../../lib/costUnits';

export { pricingUnit };

/** One variant as the cost walk needs it. */
export interface CostNode {
  variantId: number;
  productId: number;
  /** «Молоко вівсяне», «Латте · M». */
  caption: string;
  unit: string;
  /**
   * Last purchase price per ONE base unit (a gram, a millilitre, a piece), in
   * THOUSANDTHS of a kopeck (`lib/costUnits.ts`) — 35,50 ₴/кг is 3550 a gram.
   */
  costMilli: number;
  /** Assembled when it sells: its cost is its recipe's, and its own `costMilli` is not read. */
  derived: boolean;
  /** Any recipe at all (`derived` or made in advance). */
  recipe: boolean;
  /** Not on the sell screen: an ingredient or a prep. */
  ingredient: boolean;
  components: ProductComponentInput[];
}

export type CostIndex = Map<number, CostNode>;

export function buildCostIndex(products: readonly Product[]): CostIndex {
  const index: CostIndex = new Map();
  for (const product of products) {
    const composite = product.kind === 'composite';
    for (const variant of product.variants) {
      index.set(variant.id, {
        variantId: variant.id,
        productId: product.id,
        caption: variant.label ? `${product.name} · ${variant.label}` : product.name,
        unit: variant.unit,
        costMilli: costMilliOf(variant),
        derived: composite && product.stock_mode === 'derived',
        recipe: composite,
        ingredient: product.sellable === false,
        components: (variant.components ?? []).map((c) => ({
          component_variant_id: c.component_variant_id,
          quantity: c.quantity,
        })),
      });
    }
  }
  return index;
}

/** What ONE base unit of a variant costs when it goes into a recipe. */
export interface UnitCost {
  /** Thousandths of a kopeck — exact, a plain sum of the shelves under it. */
  milli: number;
  /** Some shelf under it has no purchase price: `milli` is then a floor, not a figure. */
  unpriced: boolean;
}

/**
 * The cost of one unit of `variantId` as a component. `seen` stops a cycle the
 * server would refuse anyway — a draft may hold one for a moment.
 */
export function unitCostOf(index: CostIndex, variantId: number, seen: ReadonlySet<number> = new Set()): UnitCost {
  const node = index.get(variantId);
  if (!node) return { milli: 0, unpriced: true };
  if (!node.derived) return { milli: node.costMilli, unpriced: node.costMilli <= 0 };
  if (seen.has(variantId)) return { milli: 0, unpriced: true };
  const inner = new Set(seen).add(variantId);
  let milli = 0;
  let unpriced = false;
  for (const part of node.components) {
    const one = unitCostOf(index, part.component_variant_id, inner);
    milli += one.milli * part.quantity;
    if (one.unpriced) unpriced = true;
  }
  return { milli, unpriced };
}

export interface RecipeLine {
  variantId: number;
  quantity: number;
  /** Per one base unit of the component, thousandths of a kopeck. */
  unitMilli: number;
  lineMilli: number;
  /** The line in whole kopecks, for display — the total is NOT the sum of these. */
  lineCents: number;
  unpriced: boolean;
}

export interface RecipeCost {
  lines: RecipeLine[];
  /** Σ of the lines in thousandths of a kopeck — a floor when `unpriced`. */
  milli: number;
  /** The same sum as money: rounded once, at the end, as the server rounds it. */
  cents: number;
  unpriced: boolean;
  /** The captions of the lines that have no price, for «не вистачає ціни: …». */
  missing: string[];
}

/** What one unit of a dish costs to assemble from `components`, line by line. */
export function recipeCost(index: CostIndex, components: readonly ProductComponentInput[], selfId?: number): RecipeCost {
  const seen = selfId == null ? new Set<number>() : new Set([selfId]);
  const lines: RecipeLine[] = [];
  const missing: string[] = [];
  let milli = 0;
  for (const part of components) {
    const one = unitCostOf(index, part.component_variant_id, seen);
    const lineMilli = one.milli * part.quantity;
    milli += lineMilli;
    if (one.unpriced) missing.push(index.get(part.component_variant_id)?.caption ?? `Варіант ${part.component_variant_id}`);
    lines.push({
      variantId: part.component_variant_id,
      quantity: part.quantity,
      unitMilli: one.milli,
      lineMilli,
      lineCents: milliToCents(lineMilli),
      unpriced: one.unpriced,
    });
  }
  return { lines, milli, cents: milliToCents(milli), unpriced: missing.length > 0, missing };
}

/**
 * Cost as a share of price in basis points (2500 = 25 %), or null when it
 * cannot be told honestly — no price, no recipe, or a shelf with no cost. The
 * server's rule to the letter, so the figure does not jump on save.
 */
export function foodCostBps(cost: Pick<RecipeCost, 'milli' | 'unpriced' | 'lines'>, priceCents: number): number | null {
  if (priceCents <= 0 || cost.lines.length === 0 || cost.unpriced) return null;
  // From the sum before it is rounded to kopecks, like the server's.
  return costShareBps(cost.milli, priceCents);
}

/** The price at which this cost is exactly the target share — rounded UP to a whole hryvnia. */
export function priceForTarget(costCents: number, targetBps: number): number | null {
  if (costCents <= 0 || targetBps <= 0) return null;
  return Math.ceil((costCents * 10000) / targetBps / 100) * 100;
}

/** «40 ₴/л», «35,50 ₴/кг» from a per-base-unit cost in thousandths of a kopeck. */
export function unitPriceText(costMilli: number, unit: string): string {
  const { per, label } = pricingUnit(unit);
  return `${moneyText(milliToPrice(costMilli, per))}/${label}`;
}

/** «23,40 ₴» — and «23 ₴» for a whole sum; a recipe line reads better without «,00». */
export function moneyText(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${cents < 0 ? '−' : ''}${grouped}${frac === 0 ? '' : `,${String(frac).padStart(2, '0')}`} ₴`;
}

/**
 * A typed «₴ за кг» (in kopecks) into the stored cost per base unit, in
 * thousandths of a kopeck — exact to the kopeck per kilogram or litre.
 */
export function humanPriceToBaseMilli(humanCents: number, unit: string): number {
  return priceToMilli(humanCents, pricingUnit(unit).per);
}

/** The stored cost as the «₴ за кг» a price box shows, in kopecks. */
export function baseMilliToHumanPrice(costMilli: number, unit: string): number {
  return milliToPrice(costMilli, pricingUnit(unit).per);
}

/** A recipe scaled for another size: every quantity × factor, never below one unit. */
export function scaleRecipe(components: readonly ProductComponentInput[], factor: number): ProductComponentInput[] {
  return components.map((c) => ({
    component_variant_id: c.component_variant_id,
    quantity: Math.max(1, Math.round(c.quantity * factor)),
  }));
}
