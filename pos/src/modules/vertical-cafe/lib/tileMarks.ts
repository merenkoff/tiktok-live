// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What other modules say on this catalog's tiles (platform 25,
// `useCartStore.tileMarks`): the remote kitchen's «≈30 хв» on a dish it cooks
// for this cafe, «пауза» while it takes nothing, «потрібна мережа» offline.
// The catalog draws the word and knows nothing of the kitchen — a module that
// reaches into another module's screen is what this keeps out.

/** One module's word on one variant — the host's `TileMark`, mirrored. */
export interface TileMark {
  text: string;
  blocked: boolean;
}

export type TileMarks = Readonly<Record<string, Readonly<Record<number, TileMark>>>>;

/** The variants a module said cannot be sold right now (`blocked`). */
export function blockedVariantIds(
  variants: ReadonlyArray<{ variant_id: number }>,
  marks: TileMarks | undefined
): Set<number> {
  const out = new Set<number>();
  if (!marks) return out;
  for (const byVariant of Object.values(marks)) {
    for (const v of variants) {
      const mark = byVariant?.[v.variant_id];
      if (mark?.blocked && typeof mark.text === 'string' && mark.text) out.add(v.variant_id);
    }
  }
  return out;
}

/**
 * The mark a product's tile shows. A blocked word only when EVERY variant is
 * blocked — then the tile is grey and says why; a size the cafe still sells
 * keeps the tile live, the blocked size simply left out of what a tap offers
 * (`blockedVariantIds`). Otherwise the first neutral word any module put on a
 * variant that sells. Null when nobody said anything — or the host is older
 * than platform 25 and has no marks at all.
 */
export function tileMarkOf(variants: ReadonlyArray<{ variant_id: number }>, marks: TileMarks | undefined): TileMark | null {
  if (!marks || variants.length === 0) return null;
  const blocked = blockedVariantIds(variants, marks);
  let firstBlocked: TileMark | null = null;
  let firstWord: TileMark | null = null;
  for (const byVariant of Object.values(marks)) {
    for (const v of variants) {
      const mark = byVariant?.[v.variant_id];
      if (!mark || typeof mark.text !== 'string' || !mark.text) continue;
      if (mark.blocked) firstBlocked ??= mark;
      else if (!blocked.has(v.variant_id)) firstWord ??= mark;
    }
  }
  if (blocked.size === variants.length) return firstBlocked;
  return firstWord;
}
