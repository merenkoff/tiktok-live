// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product card's two halves (TechDocs/POS_CLOTHING.md, phase C1e): what
// the server has (the snapshot) and what the owner typed (the draft), both in
// one shape, so «what changed» is a comparison and not a set of flags.
//
// Money and quantities are kept as TEXT in the draft: the old form stored
// cents and re-rendered `toFixed(2)` on every keystroke, so typing «4», «40»,
// «400» snapped back after each digit. The text is parsed once, on save.
//
// Pure, no I/O: `productDraft.test.ts` pins every rule here.

import { uahInputToCents } from '@pos/platform';
import type { AttributeValues, Product, ProductComponentInput, ProductVariant } from '@pos/platform';
import { shapeOf, type ProductShape } from './productShape';

export interface VariantDraft {
  id: number;
  /** The caption the server built; read-only here — it rederives it on save. */
  label: string;
  /** Read-only: stock moves through documents, never through this card. */
  quantity: number;
  attributes: AttributeValues;
  unit: string;
  /** Raw text — «400», «400,50». */
  price: string;
  compareAtCents: number | null;
  /** Raw text of the purchase price; empty means «not said» (0 on the wire). */
  cost: string;
  sku: string;
  barcode: string;
  pack: { qty: string; label: string };
  components: ProductComponentInput[];
}

export interface ProductDraft {
  name: string;
  description: string;
  composition: string;
  allergens: string[];
  imageUrl: string | null;
  sellable: boolean;
  shape: ProductShape;
  tagIds: number[];
  groupIds: number[];
  /** Active variants only, in the server's order. */
  variants: VariantDraft[];
}

/** 40000 → «400», 40050 → «400.50»: what an input shows for a stored amount. */
export function centsToInput(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

export function variantDraftOf(v: ProductVariant): VariantDraft {
  return {
    id: v.id,
    label: v.label ?? '',
    quantity: v.quantity ?? 0,
    attributes: { ...(v.attributes ?? {}) },
    unit: v.unit,
    price: centsToInput(v.price_cents),
    compareAtCents: v.compare_at_cents ?? null,
    cost: v.cost_cents ? centsToInput(v.cost_cents) : '',
    sku: v.sku ?? '',
    barcode: v.barcode ?? '',
    pack: { qty: v.pack_qty == null ? '' : String(v.pack_qty), label: v.pack_label ?? '' },
    components: (v.components ?? []).map((c) => ({
      component_variant_id: c.component_variant_id,
      quantity: c.quantity,
    })),
  };
}

/**
 * The ONE place that reads a raw `Product`: every optional field an older
 * payload may lack (`composition`, `allergens`, `modifier_group_ids`,
 * `tag_ids`, `sellable`) is normalised here and nowhere else.
 */
export function draftOf(product: Product): ProductDraft {
  return {
    name: product.name,
    description: product.description ?? '',
    composition: product.composition ?? '',
    allergens: [...(product.allergens ?? [])],
    imageUrl: product.image_url ?? null,
    sellable: product.sellable !== false,
    shape: shapeOf(product),
    tagIds: [...(product.tag_ids ?? [])],
    groupIds: [...(product.modifier_group_ids ?? [])],
    variants: product.variants.filter((v) => v.is_active).map(variantDraftOf),
  };
}

/** «Рожевий / 86», or «Варіант» for a card whose one variant has no caption. */
export function rowName(v: Pick<VariantDraft, 'label'>): string {
  return v.label || 'Варіант';
}

function sameAttributes(a: AttributeValues, b: AttributeValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    const leftBlank = left == null || left === '';
    const rightBlank = right == null || right === '';
    if (leftBlank && rightBlank) continue;
    if (String(left) !== String(right)) return false;
  }
  return true;
}

function sameComponents(a: ProductComponentInput[], b: ProductComponentInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) => row.component_variant_id === b[i]!.component_variant_id && row.quantity === b[i]!.quantity
  );
}

function packQty(qty: string): number | null {
  return qty.trim() === '' ? null : Number(qty);
}

/**
 * Whether the owner changed anything the server would store. Text is compared
 * by what it MEANS — «400» and «400,00» are one price, « KZ-86 » is «KZ-86».
 */
export function variantChanged(a: VariantDraft, b: VariantDraft): boolean {
  if (uahInputToCents(a.price) !== uahInputToCents(b.price)) return true;
  if (uahInputToCents(a.cost) !== uahInputToCents(b.cost)) return true;
  if ((a.compareAtCents ?? null) !== (b.compareAtCents ?? null)) return true;
  if (a.sku.trim() !== b.sku.trim()) return true;
  if (a.barcode.trim() !== b.barcode.trim()) return true;
  if (a.unit !== b.unit) return true;
  if (packQty(a.pack.qty) !== packQty(b.pack.qty)) return true;
  if (a.pack.label.trim() !== b.pack.label.trim()) return true;
  if (!sameAttributes(a.attributes, b.attributes)) return true;
  if (!sameComponents(a.components, b.components)) return true;
  return false;
}

/**
 * Whether the composition rides along: `keep` sends the draft's (a composite),
 * `clear` sends an empty one (the product is becoming simple), `omit` leaves
 * it out (a simple product may not carry one, so it is never mentioned).
 */
export type ComponentsMode = 'keep' | 'clear' | 'omit';

export interface VariantPayload {
  attributes: AttributeValues;
  unit: string;
  price_cents: number;
  compare_at_cents: number | null;
  cost_cents: number;
  sku: string;
  barcode: string;
  pack_qty: number | null;
  pack_label: string;
  components?: ProductComponentInput[];
}

/** The body of `PATCH /variants/:id` for one row — the whole row, as the server replaces it. */
export function variantPayload(v: VariantDraft, components: ComponentsMode): VariantPayload {
  return {
    attributes: v.attributes,
    unit: v.unit,
    price_cents: uahInputToCents(v.price),
    compare_at_cents: v.compareAtCents ?? null,
    cost_cents: uahInputToCents(v.cost),
    // An empty string clears the field, which is what an emptied box means.
    sku: v.sku.trim(),
    barcode: v.barcode.trim(),
    // Sent as a pair every time: the form owns both halves, and sending one
    // alone is what the server refuses by name.
    pack_qty: packQty(v.pack.qty),
    pack_label: v.pack.label.trim(),
    ...(components === 'keep'
      ? { components: v.components }
      : components === 'clear'
        ? { components: [] }
        : {}),
  };
}

/** The product-level fields `PATCH /products/:id` takes, from the draft. */
export function detailsOf(d: ProductDraft) {
  return {
    name: d.name.trim(),
    description: d.description,
    composition: d.composition,
    allergens: d.allergens,
    image_url: d.imageUrl,
    sellable: d.sellable,
  };
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((x, i) => x === right[i]);
}

export interface ProductDiff {
  /** Name, description, composition, allergens, photo, sellable. */
  details: boolean;
  shape: boolean;
  tags: boolean;
  /** Order matters: the chips' order is the till's order. */
  groups: boolean;
  /** The rows the server will be asked to write. */
  variants: VariantDraft[];
}

export function diffProduct(snapshot: ProductDraft, draft: ProductDraft): ProductDiff {
  const before = new Map(snapshot.variants.map((v) => [v.id, v]));
  return {
    details:
      snapshot.name.trim() !== draft.name.trim() ||
      snapshot.description !== draft.description ||
      snapshot.composition !== draft.composition ||
      !sameStrings(snapshot.allergens, draft.allergens) ||
      (snapshot.imageUrl ?? null) !== (draft.imageUrl ?? null) ||
      snapshot.sellable !== draft.sellable,
    shape: snapshot.shape !== draft.shape,
    tags: !sameSet(snapshot.tagIds, draft.tagIds),
    groups: !sameStrings(snapshot.groupIds.map(String), draft.groupIds.map(String)),
    variants: draft.variants.filter((v) => {
      const was = before.get(v.id);
      return !was || variantChanged(was, v);
    }),
  };
}

export function isDirty(diff: ProductDiff): boolean {
  return diff.details || diff.shape || diff.tags || diff.groups || diff.variants.length > 0;
}
