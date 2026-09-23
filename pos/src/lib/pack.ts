// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/pack.ts — the purchase pack, as the screens that type a quantity
// in need it (migration 054, café phase К5).
//
// Stock is counted in base units and stays that way: 200 ml of milk is
// quantity 200 in unit 'мл'. That is right for a recipe, a write-off and the
// fiscal line, and wrong for exactly one person — whoever stands at the back
// door with a delivery note. Oil arrives in bottles. Five bottles is 5000, and
// that multiplication happens in a human head every morning.
//
// So the pack is a TYPING AID and nothing else. Everything here converts what
// the person typed into base units BEFORE it leaves the screen; the server
// never sees a bottle. That is also why nothing here is persisted: a document
// written in March must not change meaning when a bottle becomes 750 ml in
// June — it records «5000 мл», and any screen that wants to say «5 пляшок»
// divides by the pack the variant has TODAY, as a convenience, not as history.

/** What the quantity box is currently counting in. */
export type PackMode = 'pack' | 'base';

/** The pair as it travels on a variant, a catalog row or an on-hand row. */
export interface VariantPack {
  pack_qty?: number | null;
  pack_label?: string | null;
}

/** A pack that is actually usable — both halves present and sane. */
export interface Pack {
  /** Base units in one pack. */
  qty: number;
  /** What it is called («пляшка»). */
  label: string;
}

/**
 * The one predicate every screen asks: does this row have a pack at all?
 *
 * Null unless BOTH halves are there — the server refuses to store half a pair
 * (`normalizePack`), but a row cached by an older build carries neither field,
 * and a screen must not offer a toggle that multiplies by `undefined`. This is
 * also what keeps a clothing shop looking exactly as it did: no pack, no
 * toggle, no hint, nothing added to the screen.
 */
export function packOf(row: VariantPack | null | undefined): Pack | null {
  if (!row) return null;
  const qty = row.pack_qty;
  const label = (row.pack_label ?? '').trim();
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  if (label === '') return null;
  return { qty, label };
}

/** Packs → base units. 5 bottles of 1000 ml is 5000. */
export function packToBase(packs: number, packQty: number): number {
  if (!Number.isFinite(packs) || !Number.isFinite(packQty) || packQty <= 0) return 0;
  return packs * packQty;
}

/**
 * Base units → packs. Deliberately NOT rounded: 5200 ml of a 1000 ml bottle is
 * 5.2 bottles, and a hint that said «5 пляшок» would be a lie about the number
 * right next to it.
 */
export function baseToPack(base: number, packQty: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(packQty) || packQty <= 0) return 0;
  return base / packQty;
}

/** Whatever the box is counting in, this is what goes to the server. */
export function quantityToBase(value: number, mode: PackMode, pack: Pack | null): number {
  if (mode === 'base' || !pack) return Number.isFinite(value) ? value : 0;
  return packToBase(value, pack.qty);
}

/**
 * A number a person reads: at most three decimals, comma as the separator,
 * and no trailing zeros («5», «5,2», «0,333»).
 */
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace('.', ',');
}

/**
 * The line under the quantity box: what was typed, and what it means in the
 * other unit.
 *
 * Both directions, because both are worth seeing — in packs it says what will
 * actually land on the shelf, and in base units it says how much of a delivery
 * note that is. Deliberately «5 × пляшка» rather than «5 пляшок»: the owner
 * types one nominative singular, and guessing Ukrainian declension from it
 * would be wrong often enough to be worse than not trying.
 */
export function packHint(
  value: number,
  mode: PackMode,
  pack: Pack | null,
  unit: string
): string {
  if (!pack || !Number.isFinite(value)) return '';
  const u = unit.trim();
  if (mode === 'pack') {
    return `${num(value)} × ${pack.label} = ${num(packToBase(value, pack.qty))}${u ? ` ${u}` : ''}`;
  }
  return `${num(value)}${u ? ` ${u}` : ''} = ${num(baseToPack(value, pack.qty))} × ${pack.label}`;
}

/**
 * A purchase price typed per PACK, as cents per base unit — which is the only
 * thing `unit_cost_cents` has ever meant.
 *
 * This is the trap the toggle creates and has to close: a clerk typing «5
 * пляшок» will type the bottle's price next to it, and storing 120 ₴ as the
 * price of one millilitre would poison the cost basis and, through it, every
 * food-cost figure К5c computes. Rounded, because a cost basis is already the
 * last purchase price rather than exact arithmetic.
 */
export function packCostToBase(costCentsPerPack: number, packQty: number): number {
  if (!Number.isFinite(costCentsPerPack) || !Number.isFinite(packQty) || packQty <= 0) return 0;
  return Math.round(costCentsPerPack / packQty);
}

/** The same price the other way round, for showing it above a «пляшка» label. */
export function baseCostToPack(costCentsPerBase: number, packQty: number): number {
  if (!Number.isFinite(costCentsPerBase) || !Number.isFinite(packQty) || packQty <= 0) return 0;
  return Math.round(costCentsPerBase * packQty);
}

/**
 * How the box opens for a row that HAS a pack.
 *
 * Receiving starts in packs — oil always arrives in bottles, and that is the
 * daily pain this exists to remove. A write-off, a correction and a stock
 * count start in base units, because what is written off is 200 ml, not 0.2 of
 * a bottle. The toggle is on every one of them either way; only the starting
 * side differs.
 */
export function defaultPackMode(intent: 'receive' | 'count', pack: Pack | null): PackMode {
  if (!pack) return 'base';
  return intent === 'receive' ? 'pack' : 'base';
}
