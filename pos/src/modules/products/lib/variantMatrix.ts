// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The pure half of the size × colour matrix (TechDocs/POS_CLOTHING.md, phase C1):
// the size presets, the store's colour vocabulary and the cells a choice of
// colours and sizes makes. `VariantMatrix.tsx` draws it; nothing here touches
// React or the network, so every rule is pinned by `variantMatrix.test.ts`.
//
// Why a matrix at all: a garment is one card with a dozen variants — three
// colours in six sizes is eighteen. The form took them one at a time («+ Варіант»
// — a request and a full reload each), so a children's shop ended up with a
// card per colour and batch (26 cards that share a name) instead of a card per
// model.

import { monthsLabel, yearsLabel } from '../../../lib/sizeLadder';

/** One ready-made set of sizes. The owner picks the ones a model actually comes in. */
export interface SizeScale {
  id: string;
  label: string;
  sizes: readonly string[];
}

/** `from, from+step, … ≤ to` as text — the ladders below are all arithmetic. */
function ladder(from: number, to: number, step = 1): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n += step) out.push(String(n));
  return out;
}

/** `56-62, 62-68, …` — a pair of neighbouring heights, written with a hyphen as the server reads it. */
function pairs(from: number, to: number, step: number): string[] {
  const out: string[] = [];
  for (let n = from; n + step <= to; n += step) out.push(`${n}-${n + step}`);
  return out;
}

/** The age sizes, worded once: months up to two years, then years — `3–6 міс`, `3–4 роки`. */
const MONTH_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [3, 6],
  [6, 9],
  [9, 12],
  [12, 18],
  [18, 24],
];

function yearSteps(from: number, to: number): string[] {
  const out: string[] = [];
  for (let y = from; y < to; y++) out.push(yearsLabel(y, y + 1));
  return out;
}

/**
 * Children's first: the store this was built for sells babies' and children's
 * wear, where a size is a HEIGHT in centimetres («86»), a pair of heights
 * («98-104») or an age — and an age is written with its unit and as a range
 * («3–6 міс», «3–4 роки»), never as a bare «4» that could be an age, a height or
 * a shoe. Under every chip the matrix shows the same size in the other system
 * (`sizeHint`: «12–18 міс» under «86», «≈ 104 см» under «3–4 роки»).
 */
export const SIZE_SCALES: readonly SizeScale[] = [
  { id: 'baby-height', label: 'Малюки · зріст, см', sizes: ladder(56, 92, 6) },
  { id: 'kid-height', label: 'Діти · зріст, см', sizes: ladder(92, 164, 6) },
  { id: 'months', label: 'Вік · місяці', sizes: MONTH_STEPS.map(([a, b]) => monthsLabel(a, b)) },
  { id: 'years', label: 'Вік · роки', sizes: yearSteps(1, 14) },
  { id: 'height-pairs', label: 'Зріст від–до, см', sizes: pairs(56, 164, 6) },
  { id: 'adult', label: 'Дорослі (XS–XXL)', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'trousers', label: 'Штани, джинси', sizes: ladder(26, 34) },
  { id: 'kids-shoes', label: 'Взуття дитяче', sizes: ladder(16, 35) },
  { id: 'shoes', label: 'Взуття', sizes: ladder(36, 45) },
  { id: 'one', label: 'Без розміру', sizes: ['Універсальний'] },
];

export const DEFAULT_SCALE_ID = SIZE_SCALES[0]!.id;

/** Scales that were renamed or folded into another; a device that remembered the old id opens on the new. */
const SCALE_ALIASES: Record<string, string> = { 'year-pairs': 'years' };

export function scaleById(id: string | null | undefined): SizeScale {
  const wanted = id == null ? id : (SCALE_ALIASES[id] ?? id);
  return SIZE_SCALES.find((s) => s.id === wanted) ?? SIZE_SCALES[0]!;
}

/** The two attributes the matrix fills. A vertical without both keeps the one-variant form. */
export function supportsMatrix(attributes: ReadonlyArray<{ key: string }> | undefined): boolean {
  if (!attributes) return false;
  const keys = new Set(attributes.map((a) => a.key));
  return keys.has('color') && keys.has('size');
}

/** Trimmed, inner runs of whitespace collapsed — what «  світло   рожевий » means. */
export function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * The key two spellings of one thing share: «Малиновий» and «малиновий », and
 * «98/104», «98–104» and «98-104». The server folds the same separators in its
 * search (`foldSeparators`), so what the matrix calls «already there» is what
 * the till would call the same size.
 */
export function foldKey(text: string): string {
  return tidy(text).toLowerCase().replace(/[–—/]/g, '-');
}

export interface ColourUse {
  name: string;
  count: number;
}

/**
 * The colours this store already uses, most used first, each under its most
 * common spelling. A children's shop's catalogue held «Малиновий» and
 * «малиновий», «коричневий» and «коричневій»: typing a colour reuses the
 * spelling that is there (`canonicalColour`) instead of adding a third.
 */
export function colourVocabulary(
  products: ReadonlyArray<{ is_active?: boolean; variants: ReadonlyArray<{ is_active?: boolean; attributes?: Record<string, unknown> | null }> }>
): ColourUse[] {
  const groups = new Map<string, Map<string, number>>();
  for (const product of products) {
    if (product.is_active === false) continue;
    for (const variant of product.variants) {
      if (variant.is_active === false) continue;
      const raw = variant.attributes?.color;
      const spelled = typeof raw === 'string' ? tidy(raw) : '';
      if (!spelled) continue;
      const key = foldKey(spelled);
      const spellings = groups.get(key) ?? new Map<string, number>();
      spellings.set(spelled, (spellings.get(spelled) ?? 0) + 1);
      groups.set(key, spellings);
    }
  }
  const out: ColourUse[] = [];
  for (const spellings of groups.values()) {
    const ranked = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'));
    out.push({ name: ranked[0]![0], count: [...spellings.values()].reduce((a, b) => a + b, 0) });
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'));
}

/** What was typed, under the spelling the store already has — or tidied as typed when it is new. */
export function canonicalColour(input: string, vocabulary: ReadonlyArray<ColourUse>): string {
  const typed = tidy(input);
  if (!typed) return '';
  const key = foldKey(typed);
  return vocabulary.find((c) => foldKey(c.name) === key)?.name ?? typed;
}

/** One variant-to-be: a colour and a size, either of which may be empty. */
export interface Cell {
  color: string;
  size: string;
}

export function cellKey(cell: Cell): string {
  return `${foldKey(cell.color)}|${foldKey(cell.size)}`;
}

/**
 * Every colour × size, colour by colour with the sizes in the order given. No
 * colours means one row per size, no sizes one per colour, neither one plain
 * variant — a hat that is «one size, one colour» is still a product.
 */
export function buildCells(colours: readonly string[], sizes: readonly string[]): Cell[] {
  const cs = colours.length ? colours : [''];
  const ss = sizes.length ? sizes : [''];
  return cs.flatMap((color) => ss.map((size) => ({ color, size })));
}

/** The keys of the variants a card already has, to mark a cell «вже є» instead of creating a twin. */
export function existingKeys(
  variants: ReadonlyArray<{ is_active?: boolean; attributes?: Record<string, unknown> | null }>
): Set<string> {
  const keys = new Set<string>();
  for (const v of variants) {
    if (v.is_active === false) continue;
    const color = v.attributes?.color;
    const size = v.attributes?.size;
    keys.add(cellKey({ color: color == null ? '' : String(color), size: size == null ? '' : String(size) }));
  }
  return keys;
}

/** The smallest a batch can be before it is a batch, and the most the server takes at once. */
export const MAX_MATRIX_ROWS = 200;

/**
 * The scale that knows the most of these sizes — ties go to the earlier,
 * children's, scale — or the default when none knows any. What the receiving
 * grid opens on for a card the shop already has (clothing S1): its sizes are
 * the choice, and the scale is only where the next chip comes from.
 */
export function detectScale(sizes: readonly string[]): SizeScale {
  let best: SizeScale | null = null;
  let bestHits = 0;
  for (const scale of SIZE_SCALES) {
    const known = new Set(scale.sizes.map(foldKey));
    const hits = sizes.filter((size) => known.has(foldKey(size))).length;
    if (hits > bestHits) {
      best = scale;
      bestHits = hits;
    }
  }
  return best ?? scaleById(DEFAULT_SCALE_ID);
}

/**
 * The colours and the sizes a card's live variants span — each spelling once,
 * in the order the card lists them (the server's size order). Archived
 * variants do not count: a size the shop stopped is not on the grid unless
 * the owner picks it again.
 */
export function axesOfVariants(
  variants: ReadonlyArray<{ is_active?: boolean; attributes?: Record<string, unknown> | null }>
): { colours: string[]; sizes: string[] } {
  const colours: string[] = [];
  const sizes: string[] = [];
  const seenColours = new Set<string>();
  const seenSizes = new Set<string>();
  for (const v of variants) {
    if (v.is_active === false) continue;
    const colour = typeof v.attributes?.color === 'string' ? tidy(v.attributes.color) : '';
    const size = typeof v.attributes?.size === 'string' ? tidy(v.attributes.size) : '';
    if (colour && !seenColours.has(foldKey(colour))) {
      seenColours.add(foldKey(colour));
      colours.push(colour);
    }
    if (size && !seenSizes.has(foldKey(size))) {
      seenSizes.add(foldKey(size));
      sizes.push(size);
    }
  }
  return { colours, sizes };
}
