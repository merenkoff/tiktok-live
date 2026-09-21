// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The hall editor's arithmetic (phase К4i, TechDocs/POS_TABLES.md §4.8).
//
// The room is dragged in PIXELS and stored in CELLS. That is the whole of
// §4.8: the owner pushes a table around with a finger, but what is saved is
// «third column, second row, two cells wide», so the same room reads the same
// on a laptop, on the waiter's tablet and on the till — three screens of three
// different sizes drawing one floor plan.
//
// Tables may overlap, and nothing here prevents it: a sofa stands against a
// wall and a bar counter runs behind stools. The editor's job is to record
// what the owner sees in the room, not to have opinions about furniture.

import type { PosTable } from './types';

/** One grid cell on screen. Big enough for a finger, small enough for a room. */
export const CELL_PX = 72;

/** The server's own ceiling (`MAX_CELL` in `tables.service.ts`). */
export const MAX_CELL = 200;

/** How far a table moved, in whole cells, for a pointer that travelled `dx`/`dy`. */
export function cellsMoved(dxPx: number, dyPx: number, cellPx: number = CELL_PX): {
  dx: number;
  dy: number;
} {
  return { dx: Math.round(dxPx / cellPx), dy: Math.round(dyPx / cellPx) };
}

/**
 * Where a table lands, clamped to the room.
 *
 * Negative coordinates are not «off to the left», they are a 400 the owner
 * would have to decode mid-drag; the table simply stops at the wall.
 */
export function droppedAt(
  table: Pick<PosTable, 'pos_x' | 'pos_y' | 'width' | 'height'>,
  moved: { dx: number; dy: number }
): { pos_x: number; pos_y: number } {
  return {
    pos_x: Math.min(Math.max(0, table.pos_x + moved.dx), MAX_CELL - table.width),
    pos_y: Math.min(Math.max(0, table.pos_y + moved.dy), MAX_CELL - table.height),
  };
}

/**
 * The grid the editor draws: the room plus a margin of empty cells.
 *
 * The margin is what makes the room growable — without it there is nowhere to
 * drop a table that belongs one row further down, and the owner would have to
 * resize something first.
 */
export function editorExtent(
  tables: readonly PosTable[],
  margin = 2
): { cols: number; rows: number } {
  let cols = 4;
  let rows = 3;
  for (const t of tables) {
    cols = Math.max(cols, t.pos_x + t.width);
    rows = Math.max(rows, t.pos_y + t.height);
  }
  return { cols: Math.min(cols + margin, MAX_CELL), rows: Math.min(rows + margin, MAX_CELL) };
}

/** What `PATCH /tables/positions` needs for one table. */
export interface TablePosition {
  id: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

/**
 * The tables whose place on the plan actually changed.
 *
 * Sent as a batch after the owner lets go, never per pointer-move: N requests
 * mid-drag is the anti-pattern the speed budget is against, and it would also
 * leave the room half-saved if the Wi-Fi blinked halfway across the floor.
 */
export function changedPositions(
  before: readonly PosTable[],
  after: readonly PosTable[]
): TablePosition[] {
  const was = new Map(before.map((t) => [t.id, t]));
  const out: TablePosition[] = [];
  for (const t of after) {
    const old = was.get(t.id);
    if (
      old &&
      old.pos_x === t.pos_x &&
      old.pos_y === t.pos_y &&
      old.width === t.width &&
      old.height === t.height
    ) {
      continue;
    }
    out.push({ id: t.id, pos_x: t.pos_x, pos_y: t.pos_y, width: t.width, height: t.height });
  }
  return out;
}

/** Apply a drop to the hall's tables, leaving every other table alone. */
export function withDroppedTable(
  tables: readonly PosTable[],
  id: number,
  at: { pos_x: number; pos_y: number }
): PosTable[] {
  return tables.map((t) => (t.id === id ? { ...t, ...at } : t));
}
