// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop till's mirror of customers' credit (G3_DEBTS.md §6).
//
// Filled two ways, both from what the server said: the whole list after every
// sync pass (`GET /debts?all=1` — everyone who owes or has a limit), and one
// customer at a time whenever the till reads or writes that customer's debt
// online. Read only when the network is gone. It is a cache of the server's
// word and never a second ledger: a handover written down offline sits in the
// queue, not here, and is added on top when the till reasons about it.

import type { DebtCredit, Debtor } from '../lib/types';
import { db, quietly, type CreditRow } from './db';

/** `listDebtors` stops there (src/pos/debts.service.ts); past it, absence proves nothing. */
export const DEBTORS_PAGE = 500;

function filledKey(storeId: number): string {
  return `filledAt:${storeId}`;
}

export function creditOfRow(row: CreditRow): DebtCredit {
  return {
    customer_id: row.customerId,
    limit_cents: row.limitCents,
    locked: row.locked,
    balance_cents: row.balanceCents,
    available_cents: row.limitCents == null ? null : Math.max(0, row.limitCents - row.balanceCents),
    set_at: null,
    set_by_name: null,
  };
}

/** The credit a customer has when the mirror holds no row for them: none, and nothing owed. */
export function noCredit(customerId: number): DebtCredit {
  return {
    customer_id: customerId,
    limit_cents: null,
    locked: false,
    balance_cents: 0,
    available_cents: null,
    set_at: null,
    set_by_name: null,
  };
}

/**
 * One customer's credit, as a read or a write just answered it. A customer
 * with no limit who owes nothing has no row — exactly as the list would
 * leave them out. Throws; inside a transaction the caller decides.
 */
export async function writeCredit(
  storeId: number,
  credit: DebtCredit,
  who?: { name: string; phone?: string | null }
): Promise<void> {
  const key: [number, number] = [storeId, credit.customer_id];
  if (credit.limit_cents == null && credit.balance_cents === 0) {
    await db.credit.delete(key);
    return;
  }
  const before = await db.credit.get(key);
  await db.credit.put({
    storeId,
    customerId: credit.customer_id,
    name: who?.name ?? before?.name ?? '',
    phone: who?.phone ?? before?.phone ?? '',
    limitCents: credit.limit_cents,
    locked: credit.locked,
    balanceCents: credit.balance_cents,
    readAt: Date.now(),
  });
}

/** `writeCredit` that never throws — what a screen calls after an online read or write. */
export async function rememberCredit(
  storeId: number,
  credit: DebtCredit,
  who?: { name: string; phone?: string | null }
): Promise<void> {
  await quietly(() => writeCredit(storeId, credit, who), undefined);
}

/**
 * The whole list, as `GET /debts?all=1` answered a read that started at
 * `startedAt`. A row written after that moment (a handover this till made
 * while the list was on its way) is newer than the answer and stays.
 */
export async function applyDebtors(storeId: number, debtors: readonly Debtor[], startedAt: number): Promise<void> {
  await quietly(
    () =>
      db.transaction('rw', db.credit, db.meta, async () => {
        const rows = await db.credit.where('storeId').equals(storeId).toArray();
        const fresher = new Set(rows.filter((row) => row.readAt > startedAt).map((row) => row.customerId));
        const listed = new Set(debtors.map((d) => d.customer_id));
        // A full page may have cut someone off; only a shorter one says who is gone.
        if (debtors.length < DEBTORS_PAGE) {
          const gone = rows
            .filter((row) => !listed.has(row.customerId) && !fresher.has(row.customerId))
            .map((row): [number, number] => [storeId, row.customerId]);
          if (gone.length > 0) await db.credit.bulkDelete(gone);
        }
        const fresh: CreditRow[] = debtors
          .filter((d) => !fresher.has(d.customer_id))
          .map((d) => ({
            storeId,
            customerId: d.customer_id,
            name: d.name,
            phone: d.phone,
            limitCents: d.limit_cents,
            locked: d.locked,
            balanceCents: d.balance_cents,
            readAt: startedAt,
          }));
        if (fresh.length > 0) await db.credit.bulkPut(fresh);
        await db.meta.put({ key: filledKey(storeId), value: startedAt });
      }),
    undefined
  );
}

/** When the till last had the whole list, or null if it never had it. */
export async function mirrorFilledAt(storeId: number): Promise<number | null> {
  return quietly(async () => (await db.meta.get(filledKey(storeId)))?.value ?? null, null);
}

/**
 * What the mirror says about one customer: their credit and when it was read,
 * `none` when the till has the list and they are not on it, `unknown` when
 * the till never had the list — it cannot vouch for anyone then.
 */
export async function mirroredCredit(
  storeId: number,
  customerId: number
): Promise<{ credit: DebtCredit; readAt: number } | 'none' | 'unknown'> {
  return quietly(async () => {
    const row = await db.credit.get([storeId, customerId]);
    if (row) return { credit: creditOfRow(row), readAt: row.readAt };
    return (await mirrorFilledAt(storeId)) == null ? 'unknown' : 'none';
  }, 'unknown' as const);
}

/** Everyone in the mirror — what «Борги» shows while the network is gone. */
export async function listMirror(storeId: number): Promise<CreditRow[]> {
  return quietly(() => db.credit.where('storeId').equals(storeId).toArray(), []);
}
