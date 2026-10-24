// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The debt journal's own IndexedDB on the desktop till (grocery phase Г3 PR3,
 * TechDocs/grocery/G3_DEBTS.md §6). Two things live here, and only on the
 * desktop — the one shell that writes without a network:
 *
 *  · `credit` — the till's MIRROR of who may take goods «під запис», how much
 *    they owe and up to what limit, as the server last said it. It is what the
 *    till checks a handover against when there is no network (decision Д3
 *    holds offline too), and what «Борги» shows while the network is gone.
 *  · `issues` — the QUEUE of handovers written down without the server. The
 *    goods have already left with the customer; the row goes to
 *    `POST /debts/issue` with `offline_at` when the network is back, and its
 *    id is the `client_uuid`, so a retry after a lost answer is a replay.
 *
 * Deliberately a separate database, not tables in the shell's
 * `cloth-pos-offline` — Dexie versions a database as one schema, and a module
 * that ships on its own cadence cannot take part in the shell's history (the
 * same reason as `stocktake` and `tables`). `dexie` is an external in the
 * remote build: the host's copy, through the import map.
 */

import Dexie, { type Table } from 'dexie';
import type { CartDiscount } from '@pos/platform';
import type { IssueItem } from '../lib/types';

export type IssueStatus =
  /** Written down; waiting for the network. */
  | 'queued'
  /** A send failed with a retryable error; retried with backoff. */
  | 'error'
  /** The server will never take it — a person has to look. */
  | 'dead';

/** One line as the till rang it — for the queue list and the paper slip; never sent. */
export interface IssueLineRow {
  /** «Хліб · 500 г». */
  title: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  /** `unitPriceCents × quantity` — before the cart discount, which is its own row. */
  totalCents: number;
}

export interface IssueRow {
  /** UUID — also the `client_uuid` the server dedupes on. */
  id: string;
  storeId: number;
  /** Who wrote it down. The server files it under whoever's session sends it. */
  staffId: number;
  staffName: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  /** Exactly what `POST /debts/issue` takes. */
  items: IssueItem[];
  cartDiscount: CartDiscount | null;
  note: string | null;
  /** What the till priced it at. The server prices it again when it arrives. */
  totalCents: number;
  /** The cart discount the till took off, for the slip. */
  discountCents: number;
  lines: IssueLineRow[];
  /** When the goods left — sent as `offline_at`, so the journal dates it then. */
  createdAt: number;
  status: IssueStatus;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  deadReason?: 'rejected' | 'attempts_exhausted';
}

/** One customer's credit as the server last said it. */
export interface CreditRow {
  storeId: number;
  customerId: number;
  name: string;
  phone: string;
  /** null: this customer may not take goods «під запис». */
  limitCents: number | null;
  locked: boolean;
  /** The server's balance at `readAt`; the queue's rows are added on top when read. */
  balanceCents: number;
  readAt: number;
}

export interface MetaRow {
  key: string;
  value: number;
}

class DebtsDB extends Dexie {
  issues!: Table<IssueRow, string>;
  credit!: Table<CreditRow, [number, number]>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('cloth-pos-module-debts');
    this.version(1).stores({
      issues: 'id, storeId, status, [storeId+customerId], createdAt',
      credit: '[storeId+customerId], storeId',
      meta: 'key',
    });
  }
}

export const db = new DebtsDB();

/**
 * Every call into the database goes through this: a till in a private window,
 * with its site data cleared or without IndexedDB at all must still sell for
 * money. A mirror that throws would take the cart with it.
 */
export async function quietly<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}
