// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The draft as the waiter sees it while the server is still answering
// (К4l, TechDocs/POS_TABLES.md §4.13).
//
// A tap on a tile puts a line on the screen at once; the request that makes
// it real goes out behind it. Until the answer comes back the line is
// PENDING — drawn, counted, but not the server's word yet. What is folded
// together here is the server's draft plus those pending taps, merged by the
// very key the server merges with (`variant|sorted ids|note`, the one
// `completeSale` uses too), so a second tap on the same dish reads «2×» on
// the screen for exactly as long as the server will say «2×» afterwards.
//
// Nothing here is money: a draft line carries a preview, and the round is
// what turns it into a price (§4.3). Pure, so the arithmetic is testable
// without a screen.

import { cartLineUid, groupsOf, resolveLineModifiers } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';
import type { BillLine } from './types';

/** What a tap on the menu hands over — the café's tap rule's own shape. */
export interface DishChoice {
  item: CatalogItem;
  modifiers: number[];
  note: string;
}

/** One tap that has not been answered yet. */
export interface PendingLine {
  /** Per tap, never per dish: two taps on one latte are two of these. */
  token: string;
  /** The server's merge key, so the screen merges the way the server will. */
  uid: string;
  variant_id: number;
  product_id: number;
  product_name: string;
  variant_label: string;
  quantity: number;
  modifiers: number[];
  modifierNames: string[];
  note: string;
  /** Today's card price plus today's deltas, or null when they do not resolve. */
  preview_cents: number | null;
}

/** A draft row as drawn: the server's line, a pending tap, or both merged. */
export interface DraftLineView {
  /** Stable across renders: the server id, else the pending uid. */
  key: string;
  /** Null while the line exists only on this screen. */
  id: number | null;
  uid: string;
  /** Known for a pending row; a server row learns it from the catalog. */
  product_id: number | null;
  product_name: string;
  variant_label: string;
  modifierNames: string[];
  note: string;
  quantity: number;
  preview_unit_cents: number | null;
  /** Some or all of `quantity` is still waiting for the server. */
  pending: boolean;
}

export interface DraftSummary {
  lines: number;
  units: number;
  cents: number;
  /** False when any line has no preview, so the screen says «≈». */
  exact: boolean;
}

/** Today's price of one unit with these answers, as the server will preview it. */
export function previewCents(item: CatalogItem, modifierIds: readonly number[]): number | null {
  const resolved = resolveLineModifiers(groupsOf([item]), modifierIds);
  if (resolved.error) return null;
  return item.price_cents + resolved.deltaCents;
}

/** The pending row a tap becomes, before the server has said anything. */
export function pendingLine(choice: DishChoice, token: string): PendingLine {
  const { item, modifiers, note } = choice;
  const resolved = resolveLineModifiers(groupsOf([item]), modifiers);
  return {
    token,
    uid: cartLineUid(item.variant_id, modifiers, note),
    variant_id: item.variant_id,
    product_id: item.product_id,
    product_name: item.product_name,
    variant_label: item.label,
    quantity: 1,
    modifiers: [...modifiers],
    modifierNames: resolved.error ? [] : resolved.names,
    note,
    preview_cents: resolved.error ? null : item.price_cents + resolved.deltaCents,
  };
}

/** The server's merge key of a line it already holds. */
function serverUid(line: BillLine): string {
  const ids = line.modifiers
    .map((m) => m.modifier_id)
    .filter((id): id is number => id != null);
  return cartLineUid(line.variant_id, ids, line.note);
}

/**
 * The server's draft with the pending taps folded in.
 *
 * Server lines keep their order; a tap that matches one of them by key adds
 * to its quantity and marks it pending; a tap that matches nothing becomes a
 * new row at the end, in tap order — where the server will put it too.
 */
export function draftView(serverDraft: readonly BillLine[], pending: readonly PendingLine[]): DraftLineView[] {
  const rows: DraftLineView[] = serverDraft.map((line) => ({
    key: `srv:${line.id}`,
    id: line.id,
    uid: serverUid(line),
    product_id: null,
    product_name: line.product_name,
    variant_label: line.variant_label,
    modifierNames: line.modifiers.map((m) => m.name),
    note: line.note,
    quantity: line.quantity,
    preview_unit_cents: line.preview_unit_price_cents,
    pending: false,
  }));
  const byUid = new Map(rows.map((r) => [r.uid, r]));
  for (const tap of pending) {
    const row = byUid.get(tap.uid);
    if (row) {
      row.quantity += tap.quantity;
      row.pending = true;
      if (row.product_id == null) row.product_id = tap.product_id;
      continue;
    }
    const fresh: DraftLineView = {
      key: `pend:${tap.uid}`,
      id: null,
      uid: tap.uid,
      product_id: tap.product_id,
      product_name: tap.product_name,
      variant_label: tap.variant_label,
      modifierNames: tap.modifierNames,
      note: tap.note,
      quantity: tap.quantity,
      preview_unit_cents: tap.preview_cents,
      pending: true,
    };
    rows.push(fresh);
    byUid.set(fresh.uid, fresh);
  }
  return rows;
}

/**
 * How many of each DISH the draft holds, for the count on the tile.
 *
 * Per product across its sizes, because the tile is per product; a server
 * line names only its variant, so the catalog's own grouping is what maps it
 * back to a dish. A line whose variant the catalog no longer lists counts
 * for nothing — there is no tile to put the number on.
 */
export function countsByProduct(
  view: readonly DraftLineView[],
  grouped: ReadonlyArray<readonly [number, readonly CatalogItem[]]>
): Map<number, number> {
  const productOfVariant = new Map<number, number>();
  for (const [productId, variants] of grouped) {
    for (const v of variants) productOfVariant.set(v.variant_id, productId);
  }
  const counts = new Map<number, number>();
  for (const row of view) {
    const productId = row.product_id ?? productOfVariantByUid(row.uid, productOfVariant);
    if (productId == null) continue;
    counts.set(productId, (counts.get(productId) ?? 0) + row.quantity);
  }
  return counts;
}

/** The variant id is the key's first field, on both of its shapes. */
function productOfVariantByUid(uid: string, productOfVariant: Map<number, number>): number | null {
  const variantId = Number(uid.split('|')[0]);
  return Number.isFinite(variantId) ? (productOfVariant.get(variantId) ?? null) : null;
}

/** The figures the bar and the footer read out. */
export function draftSummary(view: readonly DraftLineView[]): DraftSummary {
  let units = 0;
  let cents = 0;
  let exact = true;
  for (const row of view) {
    units += row.quantity;
    if (row.preview_unit_cents == null) exact = false;
    else cents += row.preview_unit_cents * row.quantity;
  }
  return { lines: view.length, units, cents, exact };
}
