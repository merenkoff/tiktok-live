// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  guestsLabel,
  hallExtent,
  kitchenState,
  seatedFor,
  seatsLabel,
  seatsOfHall,
  tableTone,
  tileSum,
  visibleHalls,
} from './hallMap';
import type { OpenBillSummary, PosHall, PosTable } from './types';

const table = (over: Partial<PosTable> = {}): PosTable => ({
  id: 1,
  hall_id: 1,
  name: '1',
  seats: 2,
  pos_x: 0,
  pos_y: 0,
  width: 2,
  height: 2,
  shape: 'rect',
  is_active: true,
  ...over,
});

const bill = (over: Partial<OpenBillSummary> = {}): OpenBillSummary => ({
  id: 10,
  bill_no: 3,
  table_id: 1,
  guests: 2,
  opened_at: '2026-09-21T18:00:00.000Z',
  opened_by_name: 'Марта',
  precheck_printed_at: null,
  fired_total_cents: 12000,
  draft_count: 0,
  prep_status: null,
  ...over,
});

const hall = (tables: PosTable[], over: Partial<PosHall> = {}): PosHall => ({
  id: 1,
  name: 'Зала',
  sort_order: 0,
  is_active: true,
  tables,
  ...over,
});

describe('seatsOfHall', () => {
  it('pairs each table with the bill sitting at it', () => {
    const seats = seatsOfHall(hall([table({ id: 1 }), table({ id: 2, name: '2' })]), [
      bill({ table_id: 2 }),
    ]);
    expect(seats.map((s) => [s.table.id, s.bill?.id ?? null])).toEqual([
      [1, null],
      [2, 10],
    ]);
  });

  it('drops a retired table, but never one somebody is sitting at', () => {
    const seats = seatsOfHall(
      hall([
        table({ id: 1, is_active: false }),
        table({ id: 2, name: '2', is_active: false }),
      ]),
      [bill({ table_id: 2 })]
    );
    // The terrace is closed for the winter — except for the table that still
    // has guests and money on it.
    expect(seats.map((s) => s.table.id)).toEqual([2]);
  });
});

describe('tableTone', () => {
  it('says free, mine, somebody else’s — and a printed pre-bill wins', () => {
    expect(tableTone(null, 7)).toBe('free');
    expect(tableTone(bill({ opened_by: 7 }), 7)).toBe('mine');
    expect(tableTone(bill({ opened_by: 8 }), 7)).toBe('busy');
    expect(tableTone(bill({ opened_by: 7, precheck_printed_at: '2026-09-21T19:00:00Z' }), 7)).toBe('bill');
  });

  it('reads a table from an older mirror, with no waiter id, as somebody else’s', () => {
    expect(tableTone(bill({ opened_by: undefined }), 7)).toBe('busy');
    expect(tableTone(bill({ opened_by: 7 }), null)).toBe('busy');
  });
});

describe('kitchenState', () => {
  it('says waiting or ready — and ready wins', () => {
    expect(kitchenState(null)).toBeNull();
    expect(kitchenState(bill())).toBeNull();
    expect(kitchenState(bill({ prep_status: 'new' }))).toBe('waiting');
    // The only state that asks the waiter to walk over right now.
    expect(kitchenState(bill({ prep_status: 'ready' }))).toBe('ready');
  });
});

describe('labels', () => {
  it('declines seats and guests the Ukrainian way', () => {
    expect(seatsLabel(1)).toBe('1 місце');
    expect(seatsLabel(2)).toBe('2 місця');
    expect(seatsLabel(6)).toBe('6 місць');
    expect(guestsLabel(1)).toBe('1 гість');
    expect(guestsLabel(3)).toBe('3 гості');
    expect(guestsLabel(12)).toBe('12 гостей');
  });

  it('rounds a tile’s sum to whole hryvnias', () => {
    expect(tileSum(52_500)).toBe('525 ₴');
    expect(tileSum(124_049).replace(/\s/g, ' ')).toBe('1 240 ₴');
  });
});

describe('seatedFor', () => {
  it('reads as minutes, then as hours and minutes', () => {
    expect(seatedFor('2026-09-21T18:00:00Z', '2026-09-21T18:48:00Z')).toBe('48 хв');
    expect(seatedFor('2026-09-21T18:00:00Z', '2026-09-21T19:05:00Z')).toBe('1:05');
    expect(seatedFor('2026-09-21T18:00:00Z', '2026-09-21T20:00:00Z')).toBe('2:00');
  });

  it('never reads negative when a clock has drifted', () => {
    expect(seatedFor('2026-09-21T18:00:00Z', '2026-09-21T17:58:00Z')).toBe('0 хв');
  });
});

describe('visibleHalls and hallExtent', () => {
  it('keeps a retired hall only while somebody is still sitting in it', () => {
    const closed = hall([table({ id: 5 })], { id: 2, name: 'Тераса', is_active: false });
    expect(visibleHalls([closed], [])).toEqual([]);
    expect(visibleHalls([closed], [bill({ table_id: 5 })])).toHaveLength(1);
  });

  it('measures the grid by the furthest table, not by a fixed size', () => {
    const seats = seatsOfHall(
      hall([
        table({ id: 1, pos_x: 0, pos_y: 0, width: 2, height: 2 }),
        table({ id: 2, name: '2', pos_x: 5, pos_y: 3, width: 3, height: 1 }),
      ]),
      []
    );
    expect(hallExtent(seats)).toEqual({ cols: 8, rows: 4 });
    expect(hallExtent([])).toEqual({ cols: 1, rows: 1 });
  });
});
