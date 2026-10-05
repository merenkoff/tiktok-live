// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The pure half of receiving by matrix (clothing S1, TechDocs/POS_CLOTHING.md):
// a grid of colours × sizes with a received count in each cell, turned into
// the two kinds of line the receiving page already knows — an existing
// variant with a quantity, and a stub that the server makes into a variant
// when the document is posted (on the card named by `product_id`, or on a new
// card that every stub of the same name shares). Nothing here touches React
// or the network; `receiveMatrix.test.ts` pins every rule.

import type { AttributeValues, ProductVariant } from '@pos/platform';
import { buildCells, cellKey, MAX_MATRIX_ROWS, type Cell } from '../../products/lib/variantMatrix';

/** What the grid reads of a card: its name and its live variants. */
export interface ReceiveCard {
  id: number;
  name: string;
  variants: ReadonlyArray<
    Pick<ProductVariant, 'id' | 'label' | 'unit' | 'price_cents' | 'cost_cents' | 'quantity' | 'is_active' | 'attributes' | 'pack_qty' | 'pack_label'>
  >;
}

/** One cell of the grid: the colour × size, and the card's variant when it already has one. */
export interface ReceiveCell {
  cell: Cell;
  key: string;
  variant: ReceiveCard['variants'][number] | null;
}

/** Every colour × size, each paired with the variant the card already has for it, if any. */
export function receiveCells(
  colours: readonly string[],
  sizes: readonly string[],
  card: ReceiveCard | null
): ReceiveCell[] {
  const have = new Map<string, ReceiveCard['variants'][number]>();
  for (const v of card?.variants ?? []) {
    if (v.is_active === false) continue;
    const color = v.attributes?.color;
    const size = v.attributes?.size;
    const key = cellKey({ color: color == null ? '' : String(color), size: size == null ? '' : String(size) });
    if (!have.has(key)) have.set(key, v);
  }
  return buildCells(colours, sizes).map((cell) => {
    const key = cellKey(cell);
    return { cell, key, variant: have.get(key) ?? null };
  });
}

/** The price most of a card's live variants carry — what a new size of it most likely costs too. */
export function commonPriceCents(card: ReceiveCard | null): number | null {
  if (!card) return null;
  const counts = new Map<number, number>();
  for (const v of card.variants) {
    if (v.is_active === false) continue;
    counts.set(v.price_cents, (counts.get(v.price_cents) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [price, count] of counts) {
    if (count > bestCount) {
      best = price;
      bestCount = count;
    }
  }
  return best;
}

export interface ReceiveMatrixInput {
  card: ReceiveCard | null;
  /** The new product's name when there is no card. */
  name: string;
  cells: ReadonlyArray<ReceiveCell>;
  /** cell key → what was typed; blank means «not received». */
  quantities: Readonly<Record<string, string>>;
  /** For the cells the card does not have yet; null when the box is blank. */
  priceCents: number | null;
  /** Per base unit, for every line; null when the box is blank. */
  costCents: number | null;
  unit: string;
}

export interface ReceivePlaceholder {
  name: string;
  attributes: AttributeValues;
  quantity: number;
  price_cents: number;
  unit_cost_cents?: number;
  /** The card this stub joins when posted; absent for a new product. */
  product_id?: number;
  unit: string;
}

export interface ReceiveMatrixResult {
  existing: Array<{ variant: ReceiveCard['variants'][number]; quantity: number; label: string }>;
  placeholders: ReceivePlaceholder[];
  /** Units across every cell with a count. */
  units: number;
  /** Cells the card does not have yet, with a count. */
  newCells: number;
  /** Why this cannot be added yet, in the owner's words; null when it can. */
  problem: string | null;
}

export function cellLabel(cell: Cell): string {
  return [cell.color, cell.size].filter(Boolean).join(' · ') || 'Без кольору й розміру';
}

/**
 * What goes into the document. Rules that are easy to get backwards: a blank
 * cell is simply not received (a zero is the same); a count must be a whole
 * number — the shop counts garments, not fractions; the price is asked only
 * for cells the card does not have (an existing size keeps its own); and the
 * result is empty whenever there is a problem, so a caller cannot add half.
 */
export function buildReceiveLines(input: ReceiveMatrixInput): ReceiveMatrixResult {
  const existing: ReceiveMatrixResult['existing'] = [];
  const placeholders: ReceivePlaceholder[] = [];
  let problem: string | null = null;
  let units = 0;
  let newCells = 0;
  const name = input.card ? input.card.name : input.name.trim();

  if (input.cells.length > MAX_MATRIX_ROWS) {
    problem = `Забагато клітинок (найбільше ${MAX_MATRIX_ROWS}) — оберіть менше кольорів чи розмірів`;
  } else if (!name) {
    problem = 'Вкажіть назву товару';
  } else if (input.costCents != null && input.costCents < 0) {
    problem = 'Закупівельна ціна — число, не менше нуля';
  }

  for (const { cell, key, variant } of input.cells) {
    const raw = (input.quantities[key] ?? '').trim();
    if (raw === '') continue;
    const quantity = Number(raw.replace(',', '.'));
    if (!Number.isInteger(quantity) || quantity < 0) {
      problem ??= `Кількість — ціле число: ${cellLabel(cell)}`;
      continue;
    }
    if (quantity === 0) continue;
    units += quantity;
    if (variant) {
      existing.push({ variant, quantity, label: `${name} ${variant.label}`.trim() });
      continue;
    }
    newCells += 1;
    if (input.priceCents == null || input.priceCents <= 0) {
      problem ??= input.card ? 'Вкажіть ціну продажу для нових розмірів' : 'Вкажіть ціну продажу';
      continue;
    }
    const attributes: AttributeValues = {};
    if (cell.color) attributes.color = cell.color;
    if (cell.size) attributes.size = cell.size;
    placeholders.push({
      name,
      attributes,
      quantity,
      price_cents: input.priceCents,
      ...(input.costCents != null ? { unit_cost_cents: input.costCents } : {}),
      ...(input.card ? { product_id: input.card.id } : {}),
      unit: input.unit,
    });
  }

  if (!problem && units === 0) problem = 'Впишіть кількість хоча б в одну клітинку';

  return problem
    ? { existing: [], placeholders: [], units, newCells, problem }
    : { existing, placeholders, units, newCells, problem: null };
}
