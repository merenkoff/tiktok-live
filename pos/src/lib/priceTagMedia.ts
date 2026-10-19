// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What a price tag is printed ON at this station.
 *
 * Two media, because shops buy two:
 *
 *  - `roll` — the receipt roll the till already has. A tag is one page of
 *    automatic height that the printer cuts like a receipt
 *    (`priceTagLayout.ts`). This is all the dialog ever did.
 *  - `label` — self-adhesive labels of a fixed size. A tag is exactly one
 *    label: the page is the label (`@page size`), nothing grows past it, and
 *    the content may be turned 90° so a label that runs narrow side first
 *    through the printer still reads wide once it is stuck on
 *    (`priceLabelLayout.ts`).
 *
 * The label's size is the one the shop bought, in the words the box uses:
 * width across the roll, height along it. Which way the content runs is a
 * separate question, because the same 58×40 roll can come wound either way.
 *
 * Station-local, like the roll width before it: the media is a property of the
 * printer next to this screen, not of the store, and two counters of one shop
 * may well print on different things.
 */

import type { TagPaperWidth } from './priceTagLayout';

/** Clockwise, as the content will come out of the printer. */
export type TagRotation = 0 | 90 | 180 | 270;
export const TAG_ROTATIONS: readonly TagRotation[] = [0, 90, 180, 270];

export interface LabelSpec {
  /** Across the roll — the label's side that runs along the print head. */
  widthMm: number;
  /** Along the roll — from one gap to the next. */
  heightMm: number;
  rotate: TagRotation;
}

export type TagMedia = { kind: 'roll'; paper: TagPaperWidth } | ({ kind: 'label' } & LabelSpec);

/** Everything the dialog remembers, so switching media loses neither half. */
export interface TagMediaSettings {
  kind: 'roll' | 'label';
  paper: TagPaperWidth;
  label: LabelSpec;
}

/**
 * The bounds a label may have. A 4-inch label printer prints 104–108 mm, so
 * 110 covers it; below 20 mm across there is no room for an EAN-13 with its
 * light margins at any magnification a thermal head can lay down. 200 mm along
 * the roll is a shipping label — longer than any price tag needs.
 */
export const LABEL_WIDTH_MM = { min: 20, max: 110 } as const;
export const LABEL_HEIGHT_MM = { min: 15, max: 200 } as const;

/**
 * The sizes shops actually buy for price tags, width × height. 30×20 is left
 * out on purpose: an EAN-13 with its margins needs about 31 mm across, so on a
 * 30 mm label it cannot be printed at a size a scanner is guaranteed to read.
 * Anything else can still be typed in.
 */
export const LABEL_PRESETS: ReadonlyArray<{ widthMm: number; heightMm: number }> = [
  { widthMm: 40, heightMm: 25 },
  { widthMm: 43, heightMm: 25 },
  { widthMm: 40, heightMm: 30 },
  { widthMm: 58, heightMm: 30 },
  { widthMm: 58, heightMm: 40 },
  { widthMm: 58, heightMm: 60 },
  { widthMm: 70, heightMm: 40 },
];

export const DEFAULT_LABEL: LabelSpec = { widthMm: 58, heightMm: 40, rotate: 0 };

export const DEFAULT_TAG_MEDIA_SETTINGS: TagMediaSettings = {
  kind: 'roll',
  paper: 58,
  label: DEFAULT_LABEL,
};

/** Kept for the roll: older module bundles read only this key. */
export const TAG_PAPER_KEY = 'pos.priceTagPaperWidth';
export const TAG_MEDIA_KEY = 'pos.priceTagMedia';

function clampMm(value: unknown, range: { min: number; max: number }, fallback: number): number {
  // `Number(null)` and `Number('')` are 0, which would clamp to the smallest
  // label rather than say "nothing was given".
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  // Half a millimetre is finer than any label is sold in.
  const rounded = Math.round(n * 2) / 2;
  return Math.min(range.max, Math.max(range.min, rounded));
}

/** «58» or «58,5» — the way the box the labels came in writes it. */
export function formatMm(value: number): string {
  return String(value).replace('.', ',');
}

/** Whatever was stored or typed, as a label the layout can be computed for. */
export function normalizeLabel(input: unknown): LabelSpec {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const rotate = Number(raw.rotate);
  return {
    widthMm: clampMm(raw.widthMm, LABEL_WIDTH_MM, DEFAULT_LABEL.widthMm),
    heightMm: clampMm(raw.heightMm, LABEL_HEIGHT_MM, DEFAULT_LABEL.heightMm),
    rotate: (TAG_ROTATIONS as readonly number[]).includes(rotate) ? (rotate as TagRotation) : 0,
  };
}

/** The settings as stored, or as an older build stored them, or the defaults. */
export function parseTagMediaSettings(stored: string | null, legacyPaper: string | null): TagMediaSettings {
  const paper: TagPaperWidth = legacyPaper === '80' ? 80 : 58;
  if (!stored) return { ...DEFAULT_TAG_MEDIA_SETTINGS, paper };
  try {
    const raw = JSON.parse(stored) as Record<string, unknown>;
    return {
      kind: raw.kind === 'label' ? 'label' : 'roll',
      paper: raw.paper === 80 || raw.paper === '80' ? 80 : raw.paper === 58 ? 58 : paper,
      label: normalizeLabel(raw.label),
    };
  } catch {
    return { ...DEFAULT_TAG_MEDIA_SETTINGS, paper };
  }
}

export function mediaOf(settings: TagMediaSettings): TagMedia {
  return settings.kind === 'label'
    ? { kind: 'label', ...normalizeLabel(settings.label) }
    : { kind: 'roll', paper: settings.paper };
}

export function loadTagMediaSettings(): TagMediaSettings {
  try {
    return parseTagMediaSettings(localStorage.getItem(TAG_MEDIA_KEY), localStorage.getItem(TAG_PAPER_KEY));
  } catch {
    return DEFAULT_TAG_MEDIA_SETTINGS;
  }
}

/** The media this station prints price tags on. */
export function loadTagMedia(): TagMedia {
  return mediaOf(loadTagMediaSettings());
}

export function saveTagMediaSettings(settings: TagMediaSettings): void {
  try {
    localStorage.setItem(TAG_MEDIA_KEY, JSON.stringify(settings));
    // A florist's bench published before labels existed reads the roll width
    // from here; keep it answering.
    localStorage.setItem(TAG_PAPER_KEY, String(settings.paper));
  } catch {
    // Private browsing: the choice just does not stick.
  }
}
