// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's read mirror of the room (phase К4j, TechDocs/POS_TABLES.md §4.10).
//
// **A mirror is not a queue.** Everything the shell's offline runtime does —
// an outbox, retries, `ModuleOfflineHooks` — exists for writes waiting to
// reach the server. A bill never waits: it is mutable shared state that two
// devices may be editing over an evening, and a round fired offline would
// wake no kitchen, which is the one thing a round is for. So every write here
// still says «Потрібна мережа», the module declares no `offline` hooks at
// all, and this file is a cache and nothing more.
//
// What it buys is worth having anyway: when the Wi-Fi blinks — and in a
// restaurant it blinks — the waiter still sees which tables are taken, for
// how long and for how much, and can still read a bill out to a guest.
//
// Its own Dexie database, like `stocktake`'s: Dexie versions a database as
// one schema, and a module that ships on its own cadence cannot take part in
// the shell's version history. `dexie` is external in the remote build, so
// the host's copy is used and no second one ships in the chunk.

import Dexie, { type Table } from 'dexie';
import type { Bill, OpenBillSummary, PosHall } from '../lib/types';

/** The map, as one row: the room and who is sitting in it belong together. */
export interface RoomRow {
  /** Always 1 — one store per till. */
  id: number;
  storeId: number;
  halls: PosHall[];
  bills: OpenBillSummary[];
  /** The server's clock at the read, which is what «seated for» is measured on. */
  now: string;
  savedAt: number;
}

export interface BillRow {
  id: number;
  storeId: number;
  bill: Bill;
  savedAt: number;
}

class TablesMirrorDB extends Dexie {
  room!: Table<RoomRow, number>;
  bills!: Table<BillRow, number>;

  constructor() {
    super('cloth-pos-module-tables');
    this.version(1).stores({
      room: 'id',
      bills: 'id, storeId',
    });
  }
}

export const mirrorDb = new TablesMirrorDB();

/**
 * Every call is wrapped: a till in a private window, with site data cleared,
 * or simply without IndexedDB must still sell. A mirror that throws would
 * take the screen with it, and the screen is the part that matters.
 */
async function quietly<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

export async function saveRoom(
  storeId: number,
  room: { halls: PosHall[]; bills: OpenBillSummary[]; now: string }
): Promise<void> {
  await quietly(
    () => mirrorDb.room.put({ id: 1, storeId, ...room, savedAt: Date.now() }),
    undefined as never
  );
}

export async function loadRoom(storeId: number): Promise<RoomRow | null> {
  return quietly(async () => {
    const row = await mirrorDb.room.get(1);
    // A till that was logged into another store yesterday holds that store's
    // room; showing it would be worse than showing nothing.
    return row && row.storeId === storeId ? row : null;
  }, null);
}

export async function saveBill(storeId: number, bill: Bill): Promise<void> {
  await quietly(
    () => mirrorDb.bills.put({ id: bill.id, storeId, bill, savedAt: Date.now() }),
    undefined as never
  );
}

export async function loadBill(storeId: number, billId: number): Promise<BillRow | null> {
  return quietly(async () => {
    const row = await mirrorDb.bills.get(billId);
    return row && row.storeId === storeId ? row : null;
  }, null);
}

/**
 * Drop the bills that are no longer open.
 *
 * Called after every online read of the map: a bill that was paid an hour ago
 * is not «the till's memory of the room», it is a stale total somebody could
 * read out to a guest.
 */
export async function pruneBills(storeId: number, openIds: readonly number[]): Promise<void> {
  await quietly(async () => {
    const keep = new Set(openIds);
    const rows = await mirrorDb.bills.where('storeId').equals(storeId).toArray();
    const gone = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (gone.length > 0) await mirrorDb.bills.bulkDelete(gone);
  }, undefined as never);
}

/** Forget everything — a different store logged in on this till. */
export async function clearMirror(): Promise<void> {
  await quietly(async () => {
    await mirrorDb.room.clear();
    await mirrorDb.bills.clear();
  }, undefined as never);
}
