// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  CELL_PX,
  MAX_CELL,
  cellsMoved,
  changedPositions,
  droppedAt,
  editorExtent,
  withDroppedTable,
} from './layout';
import type { PosTable } from './types';

const table = (over: Partial<PosTable> = {}): PosTable => ({
  id: 1,
  hall_id: 1,
  name: '5',
  seats: 4,
  pos_x: 2,
  pos_y: 1,
  width: 2,
  height: 2,
  shape: 'rect',
  is_active: true,
  ...over,
});

describe('cellsMoved', () => {
  it('turns pixels dragged into whole cells', () => {
    expect(cellsMoved(CELL_PX * 2, CELL_PX)).toEqual({ dx: 2, dy: 1 });
    // Half a cell counts as one — the table goes where the finger let go,
    // not where the arithmetic rounded down.
    expect(cellsMoved(CELL_PX * 0.6, -CELL_PX * 0.6)).toEqual({ dx: 1, dy: -1 });
    expect(cellsMoved(4, 4)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('droppedAt', () => {
  it('moves the table by the cells the pointer travelled', () => {
    expect(droppedAt(table(), { dx: 1, dy: 2 })).toEqual({ pos_x: 3, pos_y: 3 });
  });

  it('stops at the wall instead of going negative', () => {
    // A negative coordinate is not «off to the left», it is a 400 the owner
    // would have to decode mid-drag.
    expect(droppedAt(table(), { dx: -9, dy: -9 })).toEqual({ pos_x: 0, pos_y: 0 });
  });

  it('stops at the far wall too, leaving the table its own width', () => {
    expect(droppedAt(table(), { dx: 999, dy: 999 })).toEqual({
      pos_x: MAX_CELL - 2,
      pos_y: MAX_CELL - 2,
    });
  });
});

describe('editorExtent', () => {
  it('draws the room plus room to grow', () => {
    // Without the margin there is nowhere to drop a table that belongs one
    // row further down.
    expect(editorExtent([table({ pos_x: 4, pos_y: 3 })])).toEqual({ cols: 8, rows: 7 });
  });

  it('never collapses to nothing on an empty hall', () => {
    expect(editorExtent([])).toEqual({ cols: 6, rows: 5 });
  });
});

describe('changedPositions', () => {
  it('sends only the tables that actually moved', () => {
    const before = [table({ id: 1 }), table({ id: 2, pos_x: 0 })];
    const after = withDroppedTable(before, 2, { pos_x: 5, pos_y: 5 });
    expect(changedPositions(before, after)).toEqual([
      { id: 2, pos_x: 5, pos_y: 5, width: 2, height: 2 },
    ]);
  });

  it('says nothing changed when a drag ends where it started', () => {
    const before = [table()];
    expect(changedPositions(before, withDroppedTable(before, 1, { pos_x: 2, pos_y: 1 }))).toEqual(
      []
    );
  });

  it('carries a table that is new to the plan', () => {
    expect(changedPositions([], [table({ id: 9 })])).toHaveLength(1);
  });
});

describe('withDroppedTable', () => {
  it('leaves every other table exactly where it was', () => {
    const before = [table({ id: 1 }), table({ id: 2, pos_x: 7 })];
    const after = withDroppedTable(before, 1, { pos_x: 0, pos_y: 0 });
    expect(after[1]).toBe(before[1]);
    expect(after[0]).toMatchObject({ pos_x: 0, pos_y: 0 });
  });
});
