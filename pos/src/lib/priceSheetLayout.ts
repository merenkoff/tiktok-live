// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Price tags laid out on A4 sheets, to be cut by hand.
 *
 * The other media print ONE tag per page, because the printer cuts (a roll) or
 * the label is its own backing (a gap-sensed roll). A sheet is the opposite:
 * the page is big, the tag is a piece of it, and the question is how many
 * pieces the sheet holds and where each one goes. That arithmetic lives here,
 * in millimetres and pure, for the same reason `priceLabelLayout.ts` does: a
 * tag shifted by a millimetre or a row that quietly spills onto the next page
 * is only ever found at the guillotine.
 *
 * The piece is the label the dialog already shows — its size and its text
 * rotation, drawn by the very same `PriceLabel`. The rotation turns the TEXT
 * inside the piece and never the piece, so the grid depends on width × height
 * alone. What the grid does choose is the SHEET's orientation: a 70×40 label
 * goes 2 × 7 = 14 to a portrait sheet and 4 × 5 = 20 to a landscape one, and
 * "as many as fit" means taking the better of the two. Portrait wins a tie,
 * the orientation every driver already has selected.
 *
 * Pieces sit edge to edge — a gap is paper thrown away, and the dashed guides
 * the printable draws say where to cut — row by row from the top left of the
 * grid, which is centred on the sheet so the printer's unprintable edge costs
 * both sides alike.
 */

import type { LabelSpec } from './priceTagMedia';

export type SheetOrientation = 'portrait' | 'landscape';

/** A4 in portrait, millimetres. */
export const A4_MM = { w: 210, h: 297 } as const;

/**
 * Kept clear on every side. Office printers cannot print the outer 3–4.5 mm of
 * a sheet (a laser's usual 4.2), and a tag that starts inside that strip comes
 * out with its edge missing; 5 mm clears all of them.
 */
export const SHEET_MARGIN_MM = 5;

export interface SheetLayout {
  orientation: SheetOrientation;
  /** The sheet as the printer takes it: 210 × 297, or turned, 297 × 210. */
  page: { w: number; h: number };
  /** One piece — the label's size. */
  cell: { w: number; h: number };
  cols: number;
  rows: number;
  perSheet: number;
  /** The grid's top-left corner on the sheet. */
  origin: { x: number; y: number };
}

/** Float noise must not cost a column: 287 / 41.0 is 6.999999… in some builds. */
const EPS = 1e-9;

function fit(available: number, size: number): number {
  // At least one: a piece larger than the sheet cannot be laid out any better,
  // and a zero here would make `sheetCount` divide by it. The label's own size
  // is capped well inside A4 (`LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM`).
  return Math.max(1, Math.floor(available / size + EPS));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function arrange(orientation: SheetOrientation, cell: { w: number; h: number }): SheetLayout {
  const page = orientation === 'portrait' ? { w: A4_MM.w, h: A4_MM.h } : { w: A4_MM.h, h: A4_MM.w };
  const usable = { w: page.w - 2 * SHEET_MARGIN_MM, h: page.h - 2 * SHEET_MARGIN_MM };
  const cols = fit(usable.w, cell.w);
  const rows = fit(usable.h, cell.h);
  return {
    orientation,
    page,
    cell,
    cols,
    rows,
    perSheet: cols * rows,
    origin: {
      x: round(Math.max(0, SHEET_MARGIN_MM + (usable.w - cols * cell.w) / 2)),
      y: round(Math.max(0, SHEET_MARGIN_MM + (usable.h - rows * cell.h) / 2)),
    },
  };
}

/** How the pieces go on the sheet, in whichever sheet orientation holds more. */
export function sheetLayout(spec: Pick<LabelSpec, 'widthMm' | 'heightMm'>): SheetLayout {
  const cell = { w: spec.widthMm, h: spec.heightMm };
  const portrait = arrange('portrait', cell);
  const landscape = arrange('landscape', cell);
  return landscape.perSheet > portrait.perSheet ? landscape : portrait;
}

/** How many sheets `total` pieces take. */
export function sheetCount(total: number, layout: Pick<SheetLayout, 'perSheet'>): number {
  return total > 0 ? Math.ceil(total / layout.perSheet) : 0;
}

/** Where piece number `index` of one sheet goes (row by row), and which cell of the grid that is. */
export function cellPosition(
  layout: Pick<SheetLayout, 'cols' | 'cell' | 'origin'>,
  index: number
): { x: number; y: number; col: number; row: number } {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  return {
    col,
    row,
    x: round(layout.origin.x + col * layout.cell.w),
    y: round(layout.origin.y + row * layout.cell.h),
  };
}

/**
 * The page size the print engine is asked for. Explicit millimetres, as
 * `labelPageRule` does, so the same thing is asked of every engine — and the
 * orientation is in the numbers, since a driver that reads only the size still
 * gets a sheet turned the right way.
 */
export function sheetPageRule(layout: Pick<SheetLayout, 'page'>): string {
  return `@page { size: ${layout.page.w}mm ${layout.page.h}mm; margin: 0; }`;
}

/**
 * A sheet's box is a hair shorter than the page: a block exactly as tall as
 * the page can spill a fraction of a pixel onto the next one, and the printer
 * then ejects a blank sheet after every real one. Nothing is placed in the
 * last millimetre (the margin is five), so nothing is lost.
 */
export const SHEET_SLACK_MM = 1;
