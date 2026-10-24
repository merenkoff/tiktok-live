// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop's queue of handovers written down without the server
// (G3_DEBTS.md §6, decision Д7: the desktop writes handovers offline, never
// repayments). What goes in is the cart as `POST /debts/issue` takes it plus
// what the slip and the list need to say; what comes out is a server entry,
// through `data/sync.ts`.

import { db, quietly, type IssueLineRow, type IssueRow } from './db';
import type { CartDiscount } from '@pos/platform';
import type { IssueItem } from '../lib/types';

const listeners = new Set<() => void>();

/** The queue changed — a row went in, went out, died or came back. */
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyQueue(): void {
  for (const listener of listeners) listener();
}

export interface NewIssue {
  /** The `client_uuid` the sheet opened with — after a timeout, the very key that may have landed. */
  id: string;
  storeId: number;
  staff: { id: number; name: string };
  customer: { id: number; name: string; phone?: string | null };
  items: IssueItem[];
  cartDiscount: CartDiscount | null;
  note: string | null;
  totalCents: number;
  discountCents: number;
  lines: IssueLineRow[];
}

/**
 * Write a handover down. The same key twice is one row: a sheet that queued
 * it once and is asked again does not give the goods twice.
 */
export async function enqueueIssue(input: NewIssue, now: number = Date.now()): Promise<IssueRow> {
  const row = await db.transaction('rw', db.issues, async () => {
    const before = await db.issues.get(input.id);
    if (before) return before;
    const fresh: IssueRow = {
      id: input.id,
      storeId: input.storeId,
      staffId: input.staff.id,
      staffName: input.staff.name,
      customerId: input.customer.id,
      customerName: input.customer.name,
      customerPhone: input.customer.phone ?? '',
      items: input.items,
      cartDiscount: input.cartDiscount,
      note: input.note,
      totalCents: input.totalCents,
      discountCents: input.discountCents,
      lines: input.lines,
      createdAt: now,
      status: 'queued',
      attempts: 0,
    };
    await db.issues.add(fresh);
    return fresh;
  });
  notifyQueue();
  return row;
}

/** Rows that still count against the customer: written down, not yet on the server, not given up on. */
function counts(row: IssueRow): boolean {
  return row.status === 'queued' || row.status === 'error';
}

/** What this till owes the server about one customer. */
export async function pendingFor(storeId: number, customerId: number): Promise<{ cents: number; count: number }> {
  return quietly(async () => {
    const rows = (await db.issues.where('[storeId+customerId]').equals([storeId, customerId]).toArray()).filter(counts);
    return { cents: rows.reduce((sum, row) => sum + row.totalCents, 0), count: rows.length };
  }, { cents: 0, count: 0 });
}

/** Pending sums by customer — for the list «Борги» draws from the mirror. */
export async function pendingByCustomer(storeId: number): Promise<Map<number, number>> {
  return quietly(async () => {
    const out = new Map<number, number>();
    for (const row of await db.issues.where('storeId').equals(storeId).toArray()) {
      if (counts(row)) out.set(row.customerId, (out.get(row.customerId) ?? 0) + row.totalCents);
    }
    return out;
  }, new Map<number, number>());
}

/** Every row of this store still in the queue — waiting, failing or given up on — oldest first. */
export async function queueRows(storeId: number): Promise<IssueRow[]> {
  return quietly(() => db.issues.where('storeId').equals(storeId).sortBy('createdAt'), []);
}

/** «Надіслати ще раз»: a row the server refused goes back to the queue with a clean slate. */
export async function retryIssue(id: string): Promise<void> {
  await quietly(
    () =>
      db.issues.update(id, {
        status: 'queued',
        attempts: 0,
        lastError: undefined,
        lastAttemptAt: undefined,
        deadReason: undefined,
      }),
    0
  );
  notifyQueue();
}

/**
 * «Прибрати»: the row leaves the till. The goods are still with the customer,
 * so the screen asks first — after this the debt exists nowhere.
 */
export async function discardIssue(id: string): Promise<void> {
  await quietly(() => db.issues.delete(id), undefined);
  notifyQueue();
}
