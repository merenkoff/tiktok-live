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

/**
 * The mark a product's tile shows: a blocked one first (the tile must say why
 * it is grey), else the first word any module put on any of its variants.
 * Null when nobody said anything — or the host is older than platform 25 and
 * has no marks at all.
 */
export function tileMarkOf(variants: ReadonlyArray<{ variant_id: number }>, marks: TileMarks | undefined): TileMark | null {
  if (!marks) return null;
  let first: TileMark | null = null;
  for (const byVariant of Object.values(marks)) {
    for (const v of variants) {
      const mark = byVariant?.[v.variant_id];
      if (!mark || typeof mark.text !== 'string' || !mark.text) continue;
      if (mark.blocked) return mark;
      first ??= mark;
    }
  }
  return first;
}
