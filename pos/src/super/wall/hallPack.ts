// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Fitting every hall of a place onto one television screen (TechDocs/POS_MENU_WALL.md, Д8).
//
// The owner drew each hall in grid CELLS (`pos_x`, `pos_y`, `width`, `height`,
// migration 052). Here the halls are laid out in one, two or three rows with
// ONE cell size for all of them, so the terrace stays smaller than the main
// room and a table's place in its room is where the owner put it. What is
// sacrificed is the exact table size: the screen enforces a minimum, so a
// one-cell stool still shows its number from across the office.

import type { MenuWallHall } from '../superApi';

export interface HallExtent {
  cols: number;
  rows: number;
}

/** The hall's grid: as far as its tables reach, never smaller than a small room. */
export function hallExtent(hall: Pick<MenuWallHall, 'tables'>): HallExtent {
  let cols = 4;
  let rows = 3;
  for (const t of hall.tables) {
    cols = Math.max(cols, t.pos_x + t.width);
    rows = Math.max(rows, t.pos_y + t.height);
  }
  return { cols, rows };
}

export interface PackedHall {
  hall: MenuWallHall;
  cols: number;
  rows: number;
  /** The table area's box, in pixels of the panel; the label sits `label` px above it. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HallPacking {
  /** One grid cell, in pixels — the same for every hall. */
  cell: number;
  items: PackedHall[];
  rowCount: number;
}

export interface PackOptions {
  width: number;
  height: number;
  /** Between halls, in pixels. */
  gap: number;
  /** The height of a hall's name above its tables, in pixels. */
  label: number;
}

/** Every way to cut `n` halls, in order, into `k` non-empty contiguous rows. */
function splits(n: number, k: number): number[][] {
  if (k === 1) return [[n]];
  const out: number[][] = [];
  for (let first = 1; first <= n - (k - 1); first += 1) {
    for (const rest of splits(n - first, k - 1)) out.push([first, ...rest]);
  }
  return out;
}

function cellFor(extents: readonly HallExtent[], rowsOf: readonly number[], o: PackOptions): number {
  let at = 0;
  let cellW = Infinity;
  let sumMaxRows = 0;
  for (const count of rowsOf) {
    const row = extents.slice(at, at + count);
    at += count;
    const cols = row.reduce((n, e) => n + e.cols, 0);
    cellW = Math.min(cellW, (o.width - o.gap * (count - 1)) / cols);
    sumMaxRows += Math.max(...row.map((e) => e.rows));
  }
  const cellH = (o.height - o.gap * (rowsOf.length - 1) - o.label * rowsOf.length) / sumMaxRows;
  return Math.min(cellW, cellH);
}

/**
 * Lay the halls out so that all of them fit the panel at the largest common
 * cell size. Tries one row, two rows, three… (never more rows than halls) and
 * keeps the arrangement with the biggest cell; rows are centred, the whole
 * block is centred vertically.
 */
export function packHalls(halls: readonly MenuWallHall[], o: PackOptions): HallPacking {
  if (halls.length === 0 || o.width <= 0 || o.height <= 0) return { cell: 0, items: [], rowCount: 0 };
  const extents = halls.map(hallExtent);
  let best: { cell: number; rowsOf: number[] } | null = null;
  const maxRows = Math.min(halls.length, 4);
  for (let k = 1; k <= maxRows; k += 1) {
    for (const rowsOf of splits(halls.length, k)) {
      const cell = cellFor(extents, rowsOf, o);
      if (!best || cell > best.cell) best = { cell, rowsOf };
    }
  }
  const cell = Math.max(1, best!.cell);
  const rowsOf = best!.rowsOf;

  const rowHeights = (() => {
    let at = 0;
    return rowsOf.map((count) => {
      const row = extents.slice(at, at + count);
      at += count;
      return o.label + Math.max(...row.map((e) => e.rows)) * cell;
    });
  })();
  const totalHeight = rowHeights.reduce((n, h) => n + h, 0) + o.gap * (rowsOf.length - 1);
  let y = Math.max(0, (o.height - totalHeight) / 2);
  const items: PackedHall[] = [];
  let at = 0;
  rowsOf.forEach((count, r) => {
    const row = extents.slice(at, at + count);
    const rowWidth = row.reduce((n, e) => n + e.cols * cell, 0) + o.gap * (count - 1);
    let x = Math.max(0, (o.width - rowWidth) / 2);
    row.forEach((e, i) => {
      items.push({ hall: halls[at + i], cols: e.cols, rows: e.rows, x, y: y + o.label, w: e.cols * cell, h: e.rows * cell });
      x += e.cols * cell + o.gap;
    });
    at += count;
    y += rowHeights[r] + o.gap;
  });
  return { cell, items, rowCount: rowsOf.length };
}
