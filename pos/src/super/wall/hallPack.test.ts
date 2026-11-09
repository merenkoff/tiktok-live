// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { MenuWallHall } from '../superApi';
import { hallExtent, packHalls } from './hallPack';

const hall = (id: number, cells: Array<[number, number, number, number]>): MenuWallHall => ({
  id,
  name: `Зал ${id}`,
  tables: cells.map(([x, y, w, h], i) => ({
    id: id * 100 + i,
    name: String(i + 1),
    pos_x: x,
    pos_y: y,
    width: w,
    height: h,
    shape: 'rect',
    today: 0,
    lastAt: null,
  })),
});

const opts = { width: 1000, height: 600, gap: 20, label: 30 };

describe('hallExtent', () => {
  it('reaches as far as the tables do, never below a small room', () => {
    expect(hallExtent(hall(1, []))).toEqual({ cols: 4, rows: 3 });
    expect(hallExtent(hall(1, [[0, 0, 2, 2]]))).toEqual({ cols: 4, rows: 3 });
    expect(hallExtent(hall(1, [[6, 4, 2, 2], [0, 0, 1, 1]]))).toEqual({ cols: 8, rows: 6 });
  });
});

describe('packHalls', () => {
  it('fills the panel with one hall at the largest cell that fits both ways', () => {
    const p = packHalls([hall(1, [[8, 2, 2, 2]])], opts); // 10 × 4 cells
    expect(p.rowCount).toBe(1);
    expect(p.items).toHaveLength(1);
    // Width-bound: 1000 / 10 = 100; height allows (600 − 30) / 4 = 142.5.
    expect(p.cell).toBe(100);
    const [it] = p.items;
    expect(it.w).toBe(1000);
    expect(it.h).toBe(400);
    expect(it.x).toBe(0);
    // Centred vertically, the label above the tables.
    expect(it.y).toBeCloseTo((600 - 430) / 2 + 30);
  });

  it('puts two wide halls one under the other when that gives a bigger cell', () => {
    const halls = [hall(1, [[18, 0, 2, 2]]), hall(2, [[18, 0, 2, 2]])]; // 20 × 3 each
    const p = packHalls(halls, opts);
    // One row: cell = (1000 − 20) / 40 = 24.5. Two rows: cell = min(1000 / 20, (600 − 20 − 60) / 6) = 50.
    expect(p.rowCount).toBe(2);
    expect(p.cell).toBe(50);
    expect(p.items[0].y).toBeLessThan(p.items[1].y);
    expect(p.items[0].x).toBe(p.items[1].x);
  });

  it('keeps two small halls side by side', () => {
    const halls = [hall(1, [[2, 2, 2, 2]]), hall(2, [[4, 2, 2, 2]])]; // 4 × 4 and 6 × 4
    const p = packHalls(halls, opts);
    // One row: min((1000 − 20) / 10 = 98, (600 − 30) / 4 = 142.5) = 98; two rows would be ≤ 65.
    expect(p.rowCount).toBe(1);
    expect(p.cell).toBe(98);
    expect(p.items[0].y).toBe(p.items[1].y);
    expect(p.items[1].x).toBeGreaterThan(p.items[0].x + p.items[0].w);
    // Everything stays inside the panel.
    for (const it of p.items) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.x + it.w).toBeLessThanOrEqual(opts.width + 1e-6);
      expect(it.y - opts.label).toBeGreaterThanOrEqual(0);
      expect(it.y + it.h).toBeLessThanOrEqual(opts.height + 1e-6);
    }
  });

  it('shares one cell size across halls of different sizes', () => {
    const halls = [hall(1, [[0, 0, 4, 4]]), hall(2, [[10, 6, 2, 2]])];
    const p = packHalls(halls, opts);
    expect(p.items[0].w / p.items[0].cols).toBeCloseTo(p.items[1].w / p.items[1].cols);
    expect(p.items[0].w / p.items[0].cols).toBeCloseTo(p.cell);
  });

  it('answers an empty room or a panel without size with nothing to draw', () => {
    expect(packHalls([], opts)).toEqual({ cell: 0, items: [], rowCount: 0 });
    expect(packHalls([hall(1, [])], { ...opts, width: 0 })).toEqual({ cell: 0, items: [], rowCount: 0 });
  });

  it('never returns a cell below one pixel, however many halls crowd a small panel', () => {
    const halls = Array.from({ length: 6 }, (_, i) => hall(i + 1, [[8, 8, 2, 2]]));
    const p = packHalls(halls, { width: 120, height: 60, gap: 4, label: 10 });
    expect(p.cell).toBeGreaterThanOrEqual(1);
    expect(p.items).toHaveLength(6);
  });
});
