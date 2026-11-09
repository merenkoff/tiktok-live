// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  A4_MM,
  SHEET_MARGIN_MM,
  cellPosition,
  sheetCount,
  sheetLayout,
  sheetPageRule,
} from './priceSheetLayout';
import { LABEL_HEIGHT_MM, LABEL_PRESETS, LABEL_WIDTH_MM } from './priceTagMedia';

const spec = (widthMm: number, heightMm: number) => ({ widthMm, heightMm });

describe('how many tags go on an A4 sheet', () => {
  // Hand-counted against the 200 × 287 mm that is left inside the 5 mm margin.
  it.each([
    // [label, orientation, columns, rows]
    ['58×40', spec(58, 40), 'portrait', 3, 7], // 174 × 280 → 21; turned: 4 × 5 = 20
    ['40×25', spec(40, 25), 'landscape', 7, 8], // portrait 5 × 11 = 55, turned 7 × 8 = 56
    ['43×25', spec(43, 25), 'landscape', 6, 8], // portrait 4 × 11 = 44, turned 48
    ['40×30', spec(40, 30), 'portrait', 5, 9], // 45; turned 7 × 6 = 42
    ['58×30', spec(58, 30), 'portrait', 3, 9], // 27; turned 4 × 6 = 24
    ['70×40', spec(70, 40), 'landscape', 4, 5], // portrait 2 × 7 = 14, turned 20
    ['58×60', spec(58, 60), 'portrait', 3, 4], // 12; turned 4 × 3 = 12 — a tie stays portrait
  ] as const)('%s', (_, label, orientation, cols, rows) => {
    const layout = sheetLayout(label);
    expect([layout.orientation, layout.cols, layout.rows]).toEqual([orientation, cols, rows]);
    expect(layout.perSheet).toBe(cols * rows);
  });

  it('takes the sheet orientation that holds more, and portrait on a tie', () => {
    // 70×40 is the case the choice exists for: 14 one way, 20 the other.
    expect(sheetLayout(spec(70, 40)).perSheet).toBe(20);
    expect(sheetLayout(spec(70, 40)).page).toEqual({ w: 297, h: 210 });
    expect(sheetLayout(spec(58, 60)).page).toEqual({ w: 210, h: 297 });
  });

  it('does not depend on which way the text runs — the rotation turns the text, not the tag', () => {
    // `sheetLayout` is handed only a size, by construction; this is the guard
    // against someone adding the rotation to the footprint.
    expect(sheetLayout({ widthMm: 58, heightMm: 40, rotate: 90 } as never)).toEqual(
      sheetLayout({ widthMm: 58, heightMm: 40, rotate: 0 } as never)
    );
  });

  it('does not lose a column to floating point noise', () => {
    // 200 / 40 and 287 / 41 land on whole numbers or just short of them.
    expect(sheetLayout(spec(40, 41)).cols).toBe(5);
    expect(sheetLayout(spec(100, 41)).cols).toBe(2);
    expect(sheetLayout(spec(100, 143.5)).rows).toBe(2);
  });

  it('fits the largest label there is — and prefers the turned sheet for it', () => {
    const biggest = sheetLayout(spec(LABEL_WIDTH_MM.max, LABEL_HEIGHT_MM.max));
    expect(biggest.perSheet).toBe(2);
    expect(biggest.orientation).toBe('landscape');
  });
});

describe('where each tag goes', () => {
  it('centres the grid inside the margin, so the printer’s unprintable edge costs both sides alike', () => {
    const layout = sheetLayout(spec(58, 40));
    // 200 − 3 × 58 = 26 → 13 each side; 287 − 7 × 40 = 7 → 3.5 each side.
    expect(layout.origin).toEqual({ x: SHEET_MARGIN_MM + 13, y: SHEET_MARGIN_MM + 3.5 });
  });

  it('fills row by row from the top left, edge to edge', () => {
    const layout = sheetLayout(spec(58, 40));
    const at = (i: number) => cellPosition(layout, i);
    expect(at(0)).toMatchObject({ col: 0, row: 0, x: 18, y: 8.5 });
    expect(at(1)).toMatchObject({ col: 1, row: 0, x: 76, y: 8.5 });
    expect(at(2)).toMatchObject({ col: 2, row: 0, x: 134, y: 8.5 });
    expect(at(3)).toMatchObject({ col: 0, row: 1, x: 18, y: 48.5 });
    expect(at(20)).toMatchObject({ col: 2, row: 6, x: 134, y: 248.5 });
  });

  it('never puts a tag outside the margin, for any label size the dialog allows', () => {
    // Every size in half-millimetre steps, as `normalizeLabel` produces them.
    for (let w = LABEL_WIDTH_MM.min; w <= LABEL_WIDTH_MM.max; w += 0.5) {
      for (let h = LABEL_HEIGHT_MM.min; h <= LABEL_HEIGHT_MM.max; h += 0.5) {
        const layout = sheetLayout(spec(w, h));
        const last = cellPosition(layout, layout.perSheet - 1);
        const first = cellPosition(layout, 0);
        const msg = `${w}×${h}`;
        expect(layout.perSheet, msg).toBeGreaterThanOrEqual(1);
        expect(first.x, msg).toBeGreaterThanOrEqual(SHEET_MARGIN_MM);
        expect(first.y, msg).toBeGreaterThanOrEqual(SHEET_MARGIN_MM);
        expect(last.x + w, msg).toBeLessThanOrEqual(layout.page.w - SHEET_MARGIN_MM + 1e-6);
        expect(last.y + h, msg).toBeLessThanOrEqual(layout.page.h - SHEET_MARGIN_MM + 1e-6);
        // And the choice really is the better of the two.
        const other = {
          cols: Math.max(1, Math.floor((layout.page.h - 2 * SHEET_MARGIN_MM) / w + 1e-9)),
          rows: Math.max(1, Math.floor((layout.page.w - 2 * SHEET_MARGIN_MM) / h + 1e-9)),
        };
        // `other` is the opposite orientation (page sides swapped).
        expect(layout.perSheet, msg).toBeGreaterThanOrEqual(other.cols * other.rows);
      }
    }
  });

  it('holds a whole number of the presets the dialog offers', () => {
    for (const p of LABEL_PRESETS) {
      const layout = sheetLayout(p);
      expect(layout.perSheet, `${p.widthMm}×${p.heightMm}`).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('sheets', () => {
  it('counts the sheets: the rest goes on the next one, and nothing means none', () => {
    const layout = sheetLayout(spec(58, 40)); // 21
    expect(sheetCount(0, layout)).toBe(0);
    expect(sheetCount(1, layout)).toBe(1);
    expect(sheetCount(21, layout)).toBe(1);
    expect(sheetCount(22, layout)).toBe(2);
    expect(sheetCount(42, layout)).toBe(2);
    expect(sheetCount(43, layout)).toBe(3);
  });

  it('asks the print engine for the sheet itself, with no margin of its own', () => {
    expect(sheetPageRule(sheetLayout(spec(58, 40)))).toBe('@page { size: 210mm 297mm; margin: 0; }');
    expect(sheetPageRule(sheetLayout(spec(70, 40)))).toBe('@page { size: 297mm 210mm; margin: 0; }');
    expect(A4_MM).toEqual({ w: 210, h: 297 });
  });
});
