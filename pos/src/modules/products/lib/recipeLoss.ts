// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Gross and net in a recipe (migration 104; the server's half is
// `netQuantity` / `normalizeLossBps` in `src/pos/composites.service.ts`).
//
// A line keeps ONE weight — the gross, what leaves the shelf, what stock and
// cost read — and the share of it that does not reach the dish. The net is
// derived from the two and never stored, so there is no second weight to
// drift from the first. What a cook's card says is the net, though, so the
// editor takes either: type the net and the gross is worked out, which is the
// sum the owner used to do on a calculator.
//
// Pure, no I/O: `recipeLoss.test.ts` pins it.

import type { ProductComponentInput } from '@pos/platform';
import type { CostIndex } from './recipeCost';

/** The largest loss a line may state: 99 % — the server's `MAX_LOSS_BPS`. */
export const MAX_LOSS_BPS = 9900;

/** A recipe line as the editor holds it: the loss always stated, 0 when there is none. */
export function recipeLineOf(line: {
  component_variant_id: number;
  quantity: number;
  loss_bps?: number | null;
}): ProductComponentInput {
  return {
    component_variant_id: line.component_variant_id,
    quantity: line.quantity,
    loss_bps: line.loss_bps ?? 0,
  };
}

/** What reaches the dish out of `gross` taken from the shelf — the server's `netQuantity`. */
export function netOf(gross: number, lossBps: number): number {
  return Math.round((gross * (10000 - lossBps)) / 10000);
}

/**
 * What must leave the shelf for `net` to reach the dish: 100 г at 20 % is
 * 125 г. Never below one unit — a line of zero is not a line.
 */
export function grossFor(net: number, lossBps: number): number {
  if (!(net > 0)) return 0;
  return Math.max(1, Math.round((net * 10000) / (10000 - Math.min(lossBps, MAX_LOSS_BPS))));
}

/** «20», «12,5» → basis points; null for anything that is not 0…99 %. An empty box is 0. */
export function parseLossPercent(text: string): number | null {
  const trimmed = text.trim().replace('%', '').trim();
  if (trimmed === '') return 0;
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(trimmed)) return null;
  const bps = Math.round(Number(trimmed.replace(',', '.')) * 100);
  return bps >= 0 && bps <= MAX_LOSS_BPS ? bps : null;
}

/** Basis points as the percent a box shows: «20», «12,5»; «» for none. */
export function lossPercentText(bps: number | null | undefined): string {
  if (!bps) return '';
  return String(bps / 100).replace('.', ',');
}

/** Whether any line of the recipe states a loss — what switches the gross/net columns on by itself. */
export function hasLosses(components: readonly ProductComponentInput[]): boolean {
  return components.some((line) => (line.loss_bps ?? 0) > 0);
}

export interface RecipeYield {
  /** Σ of the net weights of the lines counted in grams or millilitres. */
  weight: number;
  /** «г», or «мл» when every weighed line is a liquid. */
  unit: string;
  /** Lines counted in anything else — pieces, portions of a prep — named apart. */
  pieces: Array<{ caption: string; quantity: number; unit: string }>;
}

/**
 * What a portion comes to: the net of everything weighed, with the pieces
 * named beside it. Approximate by nature — a millilitre is taken for a gram,
 * and what boils away in the pan is whatever the lines' losses say — so the
 * screen writes «≈». It is there to be held against the weight on the menu.
 */
export function recipeYield(index: CostIndex, components: readonly ProductComponentInput[]): RecipeYield {
  let weight = 0;
  let grams = false;
  const pieces: RecipeYield['pieces'] = [];
  for (const line of components) {
    const node = index.get(line.component_variant_id);
    const unit = node?.unit ?? '';
    const net = netOf(line.quantity, line.loss_bps ?? 0);
    if (unit === 'г' || unit === 'мл') {
      weight += net;
      if (unit === 'г') grams = true;
    } else if (net > 0) {
      pieces.push({ caption: node?.caption ?? `Варіант ${line.component_variant_id}`, quantity: net, unit: unit || 'шт' });
    }
  }
  return { weight, unit: grams || weight === 0 ? 'г' : 'мл', pieces };
}

/** «≈ 350 г», «≈ 350 г + Яйце × 2 шт» — or «» for a recipe with nothing to weigh or count. */
export function yieldText(y: RecipeYield): string {
  const parts: string[] = [];
  if (y.weight > 0) parts.push(`≈ ${y.weight} ${y.unit}`);
  for (const piece of y.pieces) parts.push(`${piece.caption} × ${piece.quantity} ${piece.unit}`);
  return parts.join(' + ');
}
