// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/counters.ts — the short numbers a store counts out loud.
//
// The order number the barista calls («№ 7», migration 047) and the bill
// number the waiter reads off a tile («Рахунок 12», migration 052) are the
// same thing twice: a counter that starts at 1 on every day the store's own
// clock says has begun. This is that one implementation, so the second caller
// cannot drift from the first.
//
// Two properties matter and both come from where it is called, not from here:
//
// - **Inside the caller's transaction.** Passed the transaction's client, a
//   rolled-back sale or bill gives its number back and leaves no hole; an
//   idempotent replay keyed on `client_uuid` never reaches this function at
//   all and so returns the row's original number.
// - **The key carries the day.** `order_2026-09-21` is a different row from
//   `order_2026-09-22`, so midnight needs no reset job — `storeClock().today`
//   decides which row is touched.
//
// The seeded-at-1 form (INSERT … ON CONFLICT DO NOTHING, then UPDATE …
// RETURNING) is deliberately NOT the MAX-seeded form `nextDocumentNumber`
// uses for receipts: that one exists to survive a counter row lost next to
// documents that are still there, and its key never changes. A day-keyed
// counter has no such history to recover — yesterday's row stays yesterday's.

import type { pool } from '../../db.js';

/** Minimal query surface — `pool` or a checked-out client inside a transaction. */
type Queryable = { query: typeof pool.query };

/**
 * Next value of `counterKey` for this store, starting at 1.
 *
 * `counterKey` is the caller's to compose, and a day-keyed one must use the
 * STORE's day (`storeClock(...).today`), never the server's: a till in Kyiv
 * and a container in UTC disagree for three hours every night.
 */
export async function nextCounterValue(
  client: Queryable,
  storeId: number,
  counterKey: string
): Promise<number> {
  await client.query(
    `INSERT INTO pos_store_counters (store_id, counter_key, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (store_id, counter_key) DO NOTHING`,
    [storeId, counterKey]
  );
  const result = await client.query(
    `UPDATE pos_store_counters
     SET next_value = next_value + 1
     WHERE store_id = $1 AND counter_key = $2
     RETURNING next_value - 1 AS seq`,
    [storeId, counterKey]
  );
  return Number(result.rows[0].seq);
}

/** The counter key for something numbered per store-local day, e.g. `order_2026-09-21`. */
export function dailyCounterKey(prefix: string, today: string): string {
  return `${prefix}_${today}`;
}
