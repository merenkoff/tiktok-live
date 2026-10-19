// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Where everything goes on a fixed-size label.
 *
 * A tag on the receipt roll grows downwards as far as its text needs, and the
 * cutter follows it. A label cannot: it is 58×40 whatever the product is
 * called, the gap after it is where the next one starts, and anything past the
 * edge prints on the backing paper or on the next tag. So the layout is worked
 * out here, in millimetres, from the label's size — and kept pure, because the
 * numbers that decide whether the barcode scans and whether the price is
 * clipped are the ones a test has to be able to walk (`priceLabelLayout.test.ts`,
 * and the scanner simulation in `PriceTagsPrintable.test.tsx`).
 *
 * Two arrangements, chosen by the shape of what is left after rotation:
 *
 *  - landscape (wider than tall, the usual price label): name and caption on
 *    top, left-aligned; a row with the article on the left and the price on
 *    the right; the barcode across the bottom.
 *  - portrait (a label turned narrow side up): the roll tag's centred stack.
 *
 * When the text does not fit the height, the layout gives things up in a fixed
 * order: barcode height down to a comfortable minimum, the store's name, the
 * barcode down to the least a hand scanner reliably reads, the second line of
 * the product name, then the type itself down to a floor. What it never drops
 * is the caption (a child's size is the reason the tag exists), the price or
 * the barcode.
 */

import { EAN13_TOTAL_MODULES } from './ean13';
import {
  EAN13_MIN_MODULE_MM,
  TAG_BARCODE_BAR_MODULES,
  TAG_BARCODE_VIEW_MODULES,
} from './priceTagLayout';
import type { LabelSpec, TagRotation } from './priceTagMedia';

export type LabelOrientation = 'landscape' | 'portrait';

/**
 * - `barcode_small`: the label is too narrow for an EAN-13 at 80 % of the
 *   GS1 nominal size — it prints, but a scanner may not take it.
 * - `cramped`: even at the smallest type something is clipped at the bottom.
 */
export type LabelWarning = 'barcode_small' | 'cramped';

/** Type sizes, in millimetres (CSS `mm` — the print engine's own unit). */
export interface LabelFonts {
  store: number;
  name: number;
  variant: number;
  price: number;
  old: number;
  sku: number;
}

export interface LabelBarcode {
  /** One module. Never above `LABEL_MAX_MODULE_MM`, warned about below the GS1 floor. */
  moduleMm: number;
  /** The whole symbol, both light margins included — 117 modules. */
  widthMm: number;
  /** The bars alone. */
  barMm: number;
  /** Bars, longer guards and the digits under them. */
  heightMm: number;
  /** `barMm` in modules, for the SVG's `viewBox`. */
  barModules: number;
}

export interface LabelLayout {
  /** The label as it sits on the roll: width across, height along. */
  page: { w: number; h: number };
  rotate: TagRotation;
  /** The area the content is laid out in — the page, turned by `rotate`. */
  box: { w: number; h: number };
  /** Inside `box`, on each side. */
  pad: { x: number; y: number };
  orientation: LabelOrientation;
  fonts: LabelFonts;
  showStore: boolean;
  nameLines: 1 | 2;
  /** The article has its own line under the barcode (portrait) rather than sharing the price row. */
  skuOwnLine: boolean;
  barcode: LabelBarcode;
  warnings: LabelWarning[];
}

/**
 * The largest module a label gets: 106 % of the GS1 nominal. Bigger reads no
 * better at a counter, and it takes the height the caption needs.
 */
export const LABEL_MAX_MODULE_MM = 0.35;
/** Bars this tall still leave a hand scanner an easy line to cross. */
export const LABEL_COMFORT_BAR_MM = 8;
/** The least the layout will go to before it starts dropping text. */
export const LABEL_MIN_BAR_MM = 6;
export const LABEL_MAX_BAR_MM = 14;

/** Below the bars: the longer guards and the digits, in modules (as on the roll). */
const HRI_MODULES = TAG_BARCODE_VIEW_MODULES - TAG_BARCODE_BAR_MODULES;

const LINE = 1.15;
const NAME_LINE = 1.12;
const PRICE_LINE = 1.05;
/** Between one line of the label and the next. */
export const LABEL_GAP_MM = 0.5;

/** The sizes a 58×40 label is drawn at; everything else scales from them. */
const BASE: LabelFonts = { store: 2.1, name: 3.2, variant: 2.8, price: 6.4, old: 3.2, sku: 2.1 };
/** Smaller than this a 203 dpi head no longer draws a letter anyone reads. */
const FLOOR: LabelFonts = { store: 1.7, name: 1.9, variant: 1.8, price: 3.6, old: 1.9, sku: 1.7 };

/** The inner area `BASE` was drawn for, per arrangement. */
const REFERENCE: Record<LabelOrientation, { w: number; h: number }> = {
  landscape: { w: 54, h: 36 },
  portrait: { w: 37, h: 54 },
};

const EPS = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Margin across the roll. An 80 mm roll is the receipt class, whose head
 * prints only the middle 72 mm, so its labels lose 4 mm on each side before
 * anything else; every other width keeps 2 mm (less on a very narrow label),
 * which is what the guides of a label printer let the roll wander by.
 */
function padAcross(widthMm: number): number {
  if (widthMm >= 76 && widthMm <= 82) return 4.5;
  return clamp(widthMm * 0.05, 1.2, 2);
}

/** Margin along the roll: the gap sensor puts the label back within a millimetre or so. */
function padAlong(heightMm: number): number {
  return clamp(heightMm * 0.06, 1.2, 2);
}

function scaleFonts(k: number): LabelFonts {
  const out = {} as LabelFonts;
  for (const key of Object.keys(BASE) as (keyof LabelFonts)[]) {
    out[key] = round(Math.max(FLOOR[key], BASE[key] * k));
  }
  return out;
}

function shrinkFonts(fonts: LabelFonts, factor: number): LabelFonts {
  const out = {} as LabelFonts;
  for (const key of Object.keys(fonts) as (keyof LabelFonts)[]) {
    out[key] = round(Math.max(FLOOR[key], fonts[key] * factor));
  }
  return out;
}

function sameFonts(a: LabelFonts, b: LabelFonts): boolean {
  return (Object.keys(a) as (keyof LabelFonts)[]).every((key) => a[key] === b[key]);
}

function contentHeight(p: {
  fonts: LabelFonts;
  showStore: boolean;
  nameLines: number;
  skuOwnLine: boolean;
  barcodeMm: number;
}): number {
  const { fonts } = p;
  return (
    (p.showStore ? fonts.store * LINE + LABEL_GAP_MM : 0) +
    p.nameLines * fonts.name * NAME_LINE +
    LABEL_GAP_MM +
    fonts.variant * LINE +
    LABEL_GAP_MM +
    fonts.price * PRICE_LINE +
    LABEL_GAP_MM +
    p.barcodeMm +
    (p.skuOwnLine ? LABEL_GAP_MM + fonts.sku * LINE : 0)
  );
}

/**
 * How tall the content of a laid-out label is, at the line heights the
 * printable sets — the figure the layout keeps under the label's inner height.
 */
export function labelContentHeightMm(layout: LabelLayout): number {
  return contentHeight({ ...layout, barcodeMm: layout.barcode.heightMm });
}

/** The line heights the printable must use for `labelContentHeightMm` to hold. */
export const LABEL_LINE_HEIGHT = { text: LINE, name: NAME_LINE, price: PRICE_LINE } as const;

export function labelLayout(spec: LabelSpec): LabelLayout {
  const page = { w: spec.widthMm, h: spec.heightMm };
  const turned = spec.rotate === 90 || spec.rotate === 270;
  const box = turned ? { w: page.h, h: page.w } : { w: page.w, h: page.h };
  const across = padAcross(page.w);
  const along = padAlong(page.h);
  const pad = turned ? { x: along, y: across } : { x: across, y: along };
  const inner = { w: box.w - 2 * pad.x, h: box.h - 2 * pad.y };
  const orientation: LabelOrientation = box.w >= box.h * 0.85 ? 'landscape' : 'portrait';
  const reference = REFERENCE[orientation];
  let fonts = scaleFonts(clamp(Math.min(inner.w / reference.w, inner.h / reference.h), 0.6, 2));

  // The symbol takes the whole width it is given, light margins included, up
  // to the cap — the margins are what a scanner calibrates on, so they are
  // never the part that gives.
  const moduleMm = Math.min(inner.w / EAN13_TOTAL_MODULES, LABEL_MAX_MODULE_MM);
  const hriMm = HRI_MODULES * moduleMm;

  let showStore = inner.h >= (orientation === 'portrait' ? 40 : 30);
  let nameLines: 1 | 2 = 2;
  let barMm = clamp(inner.h * 0.28, LABEL_MIN_BAR_MM, LABEL_MAX_BAR_MM);
  const skuOwnLine = orientation === 'portrait';

  const need = () =>
    contentHeight({ fonts, showStore, nameLines, skuOwnLine, barcodeMm: barMm + hriMm });

  for (let step = 0; step < 60 && need() > inner.h + EPS; step += 1) {
    const over = need() - inner.h;
    if (barMm > LABEL_COMFORT_BAR_MM + EPS) {
      barMm = Math.max(LABEL_COMFORT_BAR_MM, barMm - over);
    } else if (showStore) {
      showStore = false;
    } else if (barMm > LABEL_MIN_BAR_MM + EPS) {
      barMm = Math.max(LABEL_MIN_BAR_MM, barMm - over);
    } else if (nameLines === 2) {
      nameLines = 1;
    } else {
      const next = shrinkFonts(fonts, 0.94);
      if (sameFonts(next, fonts)) break;
      fonts = next;
    }
  }

  const warnings: LabelWarning[] = [];
  if (moduleMm < EAN13_MIN_MODULE_MM) warnings.push('barcode_small');
  if (need() > inner.h + 0.05) warnings.push('cramped');

  return {
    page,
    rotate: spec.rotate,
    box,
    pad,
    orientation,
    fonts,
    showStore,
    nameLines,
    skuOwnLine,
    barcode: {
      moduleMm: round(moduleMm),
      widthMm: round(moduleMm * EAN13_TOTAL_MODULES),
      barMm: round(barMm),
      heightMm: round(barMm + hriMm),
      barModules: round(barMm / moduleMm),
    },
    warnings,
  };
}

/**
 * The CSS transform that turns the laid-out box onto the label, clockwise,
 * about the label's top-left corner. Each turn is followed by the shift that
 * brings the box back onto the page — the rotated box would otherwise sit
 * entirely off it.
 */
export function labelTransform(layout: Pick<LabelLayout, 'page' | 'rotate'>): string | undefined {
  const { w, h } = layout.page;
  switch (layout.rotate) {
    case 90:
      return `translateX(${w}mm) rotate(90deg)`;
    case 180:
      return `translate(${w}mm, ${h}mm) rotate(180deg)`;
    case 270:
      return `translateY(${h}mm) rotate(270deg)`;
    default:
      return undefined;
  }
}

/** The page size the print engine is asked for: the label, with no margin of its own. */
export function labelPageRule(layout: Pick<LabelLayout, 'page'>): string {
  const mm = (v: number) => `${Math.round(v * 1000) / 1000}mm`;
  return `@page { size: ${mm(layout.page.w)} ${mm(layout.page.h)}; margin: 0; }`;
}

/**
 * Rough advance widths, in ems, of the characters a price row is made of
 * (Helvetica/Arial: every digit is 0.556 em, bold included). Good enough to
 * tell a «12 990 ₴» that will not fit from one that will — the alternative is
 * measuring text in a print engine, which no test can do.
 */
const EM: Record<string, number> = { ' ': 0.278, '.': 0.278, ',': 0.278, '₴': 0.62 };

export function textWidthEm(text: string): number {
  let sum = 0;
  for (const ch of text) sum += /\d/.test(ch) ? 0.556 : (EM[ch] ?? 0.6);
  return sum;
}

/** A monospaced article: every character is 0.6 em. */
export function monoWidthEm(text: string): number {
  return [...text].length * 0.6;
}

/**
 * The price row's type for one tag. A long price — or a long price with the
 * old one beside it — is set smaller rather than clipped, down to 60 % of the
 * layout's size; in landscape the article keeps up to a third of the row
 * (beyond that it is cut short with an ellipsis, the price never is).
 */
export function priceRowFonts(
  layout: Pick<LabelLayout, 'box' | 'pad' | 'orientation' | 'fonts'>,
  price: string,
  old: string | null,
  sku: string | null
): { price: number; old: number } {
  const inner = layout.box.w - 2 * layout.pad.x;
  const skuRoom =
    layout.orientation === 'landscape' && sku
      ? Math.min(monoWidthEm(sku) * layout.fonts.sku, inner / 3) + 1
      : 0;
  const room = inner - skuRoom;
  const want =
    textWidthEm(price) * layout.fonts.price +
    (old ? textWidthEm(old) * layout.fonts.old + layout.fonts.old * 0.4 : 0);
  const scale = want > room ? Math.max(0.6, room / want) : 1;
  return { price: round(layout.fonts.price * scale), old: round(layout.fonts.old * scale) };
}
