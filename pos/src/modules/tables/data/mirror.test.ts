// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearMirror, loadBill, loadRoom, mirrorDb, pruneBills, saveBill, saveRoom } from './mirror';
import type { Bill, OpenBillSummary, PosHall } from '../lib/types';

const hall: PosHall = { id: 1, name: 'Зала', sort_order: 0, is_active: true, tables: [] };

const summary = (id: number): OpenBillSummary => ({
  id,
  bill_no: id,
  table_id: id,
  guests: 2,
  opened_at: '2026-09-21T18:00:00.000Z',
  opened_by_name: 'Марта',
  precheck_printed_at: null,
  fired_total_cents: 8000,
  draft_count: 0,
  prep_status: null,
});

const bill = (id: number): Bill =>
  ({
    id,
    bill_no: id,
    status: 'open',
    table_id: id,
    table_name: String(id),
    hall_id: 1,
    hall_name: 'Зала',
    guests: 2,
    note: null,
    customer_id: null,
    precheck_printed_at: null,
    opened_by: 1,
    opened_by_name: 'Марта',
    opened_at: '2026-09-21T18:00:00.000Z',
    closed_at: null,
    rounds: [],
    draft: [],
    fired_total_cents: 8000,
    draft_preview_cents: 0,
  }) as Bill;

beforeEach(async () => {
  await clearMirror();
});

describe('the room mirror', () => {
  it('remembers the room and says when it was written', async () => {
    await saveRoom(7, { halls: [hall], bills: [summary(90)], now: '2026-09-21T18:05:00.000Z' });
    const row = await loadRoom(7);
    expect(row?.halls).toHaveLength(1);
    expect(row?.bills[0].id).toBe(90);
    expect(row?.now).toBe('2026-09-21T18:05:00.000Z');
    expect(row?.savedAt).toBeGreaterThan(0);
  });

  it('never hands one store’s room to another', async () => {
    await saveRoom(7, { halls: [hall], bills: [], now: 'x' });
    // A till that was logged into another store yesterday holds that store's
    // room; showing it would be worse than showing nothing.
    expect(await loadRoom(8)).toBeNull();
  });
});

describe('the bill mirror', () => {
  it('remembers a bill the waiter opened', async () => {
    await saveBill(7, bill(90));
    expect((await loadBill(7, 90))?.bill.table_name).toBe('90');
    expect(await loadBill(8, 90)).toBeNull();
  });

  it('forgets the bills that are no longer open', async () => {
    await saveBill(7, bill(90));
    await saveBill(7, bill(91));
    await pruneBills(7, [91]);
    // A bill paid an hour ago is not «the till's memory of the room», it is a
    // stale total somebody could read out to a guest.
    expect(await loadBill(7, 90)).toBeNull();
    expect(await loadBill(7, 91)).not.toBeNull();
  });

  it('leaves another store’s rows alone while pruning', async () => {
    await saveBill(7, bill(90));
    await saveBill(8, bill(92));
    await pruneBills(7, []);
    expect(await loadBill(8, 92)).not.toBeNull();
  });
});

describe('when IndexedDB is not there at all', () => {
  it('reads as an empty mirror instead of throwing', async () => {
    // A till in a private window, or with site data cleared, must still sell:
    // every call is wrapped, and the screen simply has nothing to draw.
    const broken = new Error('InvalidStateError');
    const original = mirrorDb.room.get;
    (mirrorDb.room as { get: unknown }).get = () => Promise.reject(broken);
    await expect(loadRoom(7)).resolves.toBeNull();
    (mirrorDb.room as { get: unknown }).get = original;
  });
});
