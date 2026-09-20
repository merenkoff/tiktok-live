// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * How big a price tag is on the roll, and how big that makes one barcode
 * module.
 *
 * Kept out of the stylesheet on purpose. Every number here decides whether the
 * shop's scanner reads the tag, so they belong somewhere a test can walk a
 * simulated scan line over them (`priceTagLayout.test.ts`) — CSS cannot be
 * asked what it printed.
 */

import { EAN13_TOTAL_MODULES } from './ean13';

/** The receipt rolls a tag can come off. */
export const TAG_PAPER_WIDTHS = [58, 80] as const;

export type TagPaperWidth = (typeof TAG_PAPER_WIDTHS)[number];

/**
 * How much of the roll one tag may take.
 *
 * A tag is not a receipt: nobody reads it across a counter, it is stuck on a
 * garment or a bucket, and a full-width one wastes paper and looks like a
 * receipt that failed to cut. On 80 mm paper half the roll is plenty; a 58 mm
 * roll is already narrow, so three quarters is as far down as it goes before
 * the barcode starts costing scans.
 */
export const TAG_WIDTH_SHARE: Record<TagPaperWidth, number> = { 58: 0.75, 80: 0.5 };

/**
 * Printable width of each roll. The head is narrower than the paper, and this
 * is the ceiling the share above is clamped to — not a target.
 */
export const PRINTABLE_WIDTH_MM: Record<TagPaperWidth, number> = { 58: 48, 80: 72 };

/**
 * The bar band and the digits under it, in modules, so the whole symbol scales
 * with the tag instead of being pinned in millimetres at one paper width.
 *
 * `BAR` over the 95-module symbol is the scanner's angle tolerance:
 * atan(40/95) ≈ 23°, which is what lets a hand wave that is not quite square
 * to the tag still cross every bar. Guards run 5 modules longer — the
 * conventional look, and the digits sit below them.
 */
export const TAG_BARCODE_BAR_MODULES = 40;
export const TAG_BARCODE_GUARD_MODULES = 45;
export const TAG_BARCODE_HRI_MODULES = 9;
export const TAG_BARCODE_HRI_BASELINE = 54;
export const TAG_BARCODE_VIEW_MODULES = 56;

/**
 * GS1's magnification range for an EAN-13 at retail: the nominal module is
 * 0.33 mm, and a symbol may be printed between 80 % and 200 % of that. Below
 * the floor the bars are thinner than the print head can lay down; above the
 * ceiling a hand scanner's window no longer spans the symbol.
 */
export const EAN13_NOMINAL_MODULE_MM = 0.33;
export const EAN13_MIN_MODULE_MM = 0.264;
export const EAN13_MAX_MODULE_MM = 0.66;

/** The tag's printed width: the share of the roll, never past the print head. */
export function tagWidthMm(paper: TagPaperWidth): number {
  return Math.min(paper * TAG_WIDTH_SHARE[paper], PRINTABLE_WIDTH_MM[paper]);
}

/**
 * One barcode module, in millimetres.
 *
 * The symbol spans the whole tag *including* both quiet zones — that is the
 * only arrangement in which the light margins cannot be squeezed out by a
 * layout change later.
 */
export function moduleWidthMm(paper: TagPaperWidth): number {
  return tagWidthMm(paper) / EAN13_TOTAL_MODULES;
}

/** Height of the barcode block, keeping the SVG's own aspect ratio. */
export function barcodeHeightMm(paper: TagPaperWidth): number {
  return moduleWidthMm(paper) * TAG_BARCODE_VIEW_MODULES;
}

/** Magnification against the GS1 nominal, as the spec talks about it. */
export function magnification(paper: TagPaperWidth): number {
  return moduleWidthMm(paper) / EAN13_NOMINAL_MODULE_MM;
}

/** `mm` with the trailing noise trimmed — these end up in a `style` attribute. */
function mm(value: number): string {
  return `${Math.round(value * 1000) / 1000}mm`;
}

/**
 * The custom properties the print stylesheet reads.
 *
 * Set on the print area rather than written into the stylesheet because the
 * `@media print` rules ship with the **host** page while `PriceTagsPrintable`
 * is bundled into every module that prints a tag (see `platform/ui.ts`). A
 * module built before this change sets no properties, and the stylesheet's
 * `var(--tag-w, 48mm)` fallbacks keep it printing exactly as it did.
 */
export function tagStyleVars(paper: TagPaperWidth): Record<string, string> {
  return {
    '--tag-w': mm(tagWidthMm(paper)),
    '--tag-barcode-h': mm(barcodeHeightMm(paper)),
  };
}
