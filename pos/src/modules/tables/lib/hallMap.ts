// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers for the hall map (phase К4e). Kept apart from the page so the
// arithmetic a waiter reads at a glance — how long that table has been
// sitting, what state it is in — is testable without rendering anything.
//
// Everything here works off the SERVER's clock, handed in as `now`: the
// tablet's own clock is nobody's to set, and a table that reads «−3 хв»
// because a device drifted is worse than no number at all.

import type { OpenBillSummary, PosHall, PosTable } from './types';

/** A table, plus the bill on it when somebody is sitting there. */
export interface TableSeat {
  table: PosTable;
  bill: OpenBillSummary | null;
}

/**
 * What the tile's colour says. Deliberately four states and no more — a map
 * read from three metres away can carry four.
 */
export type TableTone = 'free' | 'seated' | 'waiting' | 'ready';

/**
 * Pair every table of a hall with its open bill.
 *
 * Retired tables (`is_active: false`) are dropped: the terrace is closed for
 * the winter and nobody can be seated there. A bill on a retired table still
 * shows, though — it would be a table somebody is sitting at right now, and
 * hiding it would lose the money on it.
 */
export function seatsOfHall(
  hall: PosHall,
  bills: readonly OpenBillSummary[]
): TableSeat[] {
  const byTable = new Map<number, OpenBillSummary>();
  for (const bill of bills) byTable.set(bill.table_id, bill);
  return hall.tables
    .map((table) => ({ table, bill: byTable.get(table.id) ?? null }))
    .filter((seat) => seat.table.is_active || seat.bill != null);
}

/**
 * The tile's state.
 *
 * `ready` beats `waiting` on purpose: a table whose food is on the pass is
 * the one the waiter should walk to, and it is the only state that asks for
 * something to be done right now.
 */
export function tableTone(bill: OpenBillSummary | null): TableTone {
  if (!bill) return 'free';
  if (bill.prep_status === 'ready') return 'ready';
  if (bill.prep_status === 'new') return 'waiting';
  return 'seated';
}

/**
 * How long the guests have been sitting, as `1:05` or `48`.
 *
 * Minutes up to an hour, then hours and minutes — the two forms a waiter
 * actually uses. A clock skew that would read negative is clamped to zero
 * rather than shown: «−2 хв» is a bug report, not a number.
 */
export function seatedFor(openedAt: string, now: string): string {
  const minutes = Math.max(
    0,
    Math.floor((new Date(now).getTime() - new Date(openedAt).getTime()) / 60000)
  );
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes} хв`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Halls with at least one table to show, in the owner's order. */
export function visibleHalls(
  halls: readonly PosHall[],
  bills: readonly OpenBillSummary[]
): PosHall[] {
  return halls.filter((hall) => hall.is_active || seatsOfHall(hall, bills).some((s) => s.bill));
}

/** The grid the tiles are laid out on: as wide and as tall as the room needs. */
export function hallExtent(seats: readonly TableSeat[]): { cols: number; rows: number } {
  let cols = 1;
  let rows = 1;
  for (const { table } of seats) {
    cols = Math.max(cols, table.pos_x + table.width);
    rows = Math.max(rows, table.pos_y + table.height);
  }
  return { cols, rows };
}
