// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/storeClock.ts — the store's clock and calendar in one read.
//
// Several things the POS does are «today, as this store counts days»: the
// order number restarts at midnight in the store's timezone, the kitchen
// board shows the current day's orders, the stop-list is «сьогодні не
// робимо». And several things depend on what kind of shop it is — whether a
// sale goes to a kitchen at all. Both facts sit on the same `pos_stores`
// row, so one read serves both, and a caller inside a transaction passes its
// own client so the day it stamps is the day the row it inserts is joined
// against.

import { pool } from '../../db.js';
import { verticalOrDefault } from '../verticals/index.js';
import type { VerticalDefinition } from '../verticals/types.js';
import { localDateString } from './localDate.js';

export interface StoreClock {
  /** IANA zone from `pos_stores.timezone`; `Europe/Kyiv` when unset. */
  timezone: string;
  /** `YYYY-MM-DD` of now in that zone — the one «what day is it». */
  today: string;
  vertical: VerticalDefinition;
}

/** Minimal query surface — `pool` or a checked-out client inside a transaction. */
interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function storeClock(client: Queryable, storeId: number): Promise<StoreClock> {
  const result = await client.query(
    `SELECT timezone, vertical FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  const timezone =
    typeof row?.timezone === 'string' && row.timezone ? row.timezone : 'Europe/Kyiv';
  return {
    timezone,
    today: localDateString(timezone),
    vertical: verticalOrDefault(row?.vertical as string | undefined),
  };
}

/** `storeClock` on the shared pool — for reads outside a transaction. */
export function readStoreClock(storeId: number): Promise<StoreClock> {
  return storeClock(pool, storeId);
}
