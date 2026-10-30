// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/pin-attempts.ts — how many wrong PINs a store's till may take
// (TechDocs/POS_PIN_ATTEMPTS.md, migration 081).
//
// A store code and a 4–6 digit PIN are all a till asks for, and since the
// guest menu may answer at /m/<store code> (migration 080) the code can be
// public. So wrong PINs are counted, per STORE: a wrong PIN names nobody — the
// PIN is what says who is logging in — so there is no one else to count them
// against. The owner's rule (2026-10-30):
//
//   misses 1–4    free;
//   misses 5–9    each one closes PIN login for 1, 5, 15, 30, 60 minutes;
//   miss 10       closes it for an hour (`PIN_BLOCK_MINUTES`), after which
//                 the count starts again from zero;
//   a success     clears everything, and so does the owner — «Розблокувати»
//                 on «Співробітники», or a new PIN for anyone.
//
// The state is two columns on `pos_stores`, not process memory: a restart
// (every deploy is one) must not hand out ten fresh attempts. An attempt is
// RESERVED before the PIN hashes are compared, with the lock it would earn as
// a miss already written; a success then clears it. Comparing a PIN against
// every staff hash takes a while, and a burst of parallel requests must not
// all slip in during that time.

import { pool } from '../db.js';

/** Misses that cost nothing. */
export const PIN_FREE_MISSES = 4;
/** The miss that closes PIN login for `PIN_BLOCK_MINUTES`. */
export const PIN_MAX_MISSES = 10;
/** How long PIN login is closed after miss 5, 6, 7, 8 and 9. */
export const PIN_WAIT_MINUTES = [1, 5, 15, 30, 60] as const;
/** How long PIN login is closed after the last miss. */
export const PIN_BLOCK_MINUTES = 60;

/** Minutes PIN login closes for after the `miss`-th wrong PIN in a row; null while free. */
export function lockMinutesAfterMiss(miss: number): number | null {
  if (miss <= PIN_FREE_MISSES) return null;
  if (miss >= PIN_MAX_MISSES) return PIN_BLOCK_MINUTES;
  return PIN_WAIT_MINUTES[miss - PIN_FREE_MISSES - 1] ?? PIN_BLOCK_MINUTES;
}

export interface PinLock {
  /** PIN login opens again at this moment. */
  until: Date;
  /** The last miss closed it, as opposed to one of the waits before it. */
  blocked: boolean;
}

export type PinReservation =
  /** `lockIfMissed`: what the store already carries, should this attempt turn out a miss. */
  | { ok: true; miss: number; lockIfMissed: PinLock | null }
  | { ok: false; lock: PinLock };

/**
 * Take one attempt for the store, counted as a miss until `clearPinMisses`
 * says otherwise — or refuse, while PIN login is closed.
 */
export async function reservePinAttempt(storeId: number): Promise<PinReservation> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT pin_failed_count, pin_locked_until, pin_locked_until > NOW() AS locked
         FROM pos_stores WHERE id = $1 FOR UPDATE`,
      [storeId]
    );
    const row = current.rows[0];
    const count = Number(row?.pin_failed_count ?? 0);
    if (row?.locked === true) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        lock: { until: new Date(row.pin_locked_until), blocked: count >= PIN_MAX_MISSES },
      };
    }
    // A block that has run out starts the count again.
    const miss = (count >= PIN_MAX_MISSES ? 0 : count) + 1;
    const updated = await client.query(
      `UPDATE pos_stores
          SET pin_failed_count = $2,
              pin_locked_until = NOW() + make_interval(mins => $3::int)
        WHERE id = $1
        RETURNING pin_locked_until`,
      [storeId, miss, lockMinutesAfterMiss(miss)]
    );
    await client.query('COMMIT');
    const until = updated.rows[0]?.pin_locked_until;
    return {
      ok: true,
      miss,
      lockIfMissed: until ? { until: new Date(until), blocked: miss >= PIN_MAX_MISSES } : null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The lock the store's last miss left, if PIN login is closed now. */
export async function currentPinLock(storeId: number): Promise<PinLock | null> {
  const result = await pool.query(
    `SELECT pin_failed_count, pin_locked_until
       FROM pos_stores WHERE id = $1 AND pin_locked_until > NOW()`,
    [storeId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { until: new Date(row.pin_locked_until), blocked: Number(row.pin_failed_count) >= PIN_MAX_MISSES };
}

/** A PIN matched, or the owner said so: the count starts from zero and PIN login is open. */
export async function clearPinMisses(storeId: number): Promise<void> {
  await pool.query(
    `UPDATE pos_stores SET pin_failed_count = 0, pin_locked_until = NULL
      WHERE id = $1 AND (pin_failed_count <> 0 OR pin_locked_until IS NOT NULL)`,
    [storeId]
  );
}

export interface PinLockStatus {
  /** Wrong PINs in a row since the last success (or the owner's reset). */
  misses: number;
  /** When PIN login opens again; null while it is open. */
  locked_until: string | null;
  /** Closed by the last miss rather than by one of the waits. */
  blocked: boolean;
}

/** What the owner's «Співробітники» shows. */
export async function getPinLockStatus(storeId: number): Promise<PinLockStatus> {
  const result = await pool.query(
    `SELECT pin_failed_count, pin_locked_until, pin_locked_until > NOW() AS locked
       FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  const row = result.rows[0];
  const misses = Number(row?.pin_failed_count ?? 0);
  const locked = row?.locked === true;
  // A block that has run out is the same as no block: the next attempt starts
  // the count again, so the screen should not keep showing ten misses.
  return {
    misses: !locked && misses >= PIN_MAX_MISSES ? 0 : misses,
    locked_until: locked ? new Date(row.pin_locked_until).toISOString() : null,
    blocked: locked && misses >= PIN_MAX_MISSES,
  };
}

/** «1 хв», «15 хв», «1 год», «1 год 5 хв» — rounded up, so a cashier never retries too early. */
export function waitWords(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} год` : `${hours} год ${rest} хв`;
}

/** The cashier's sentence for a closed PIN login. */
export function pinLockMessage(lock: PinLock, now = Date.now(), justMissed = false): string {
  const wait = waitWords(lock.until.getTime() - now);
  const lead = justMissed ? 'Невірний PIN або код магазину. ' : '';
  return lock.blocked
    ? `${lead}Вхід за PIN заблоковано на ${wait}: ${PIN_MAX_MISSES} невдалих спроб поспіль. ` +
        'Власник може розблокувати раніше в кабінеті, у розділі «Співробітники».'
    : `${lead}Забагато невдалих спроб. Наступна — через ${wait}.`;
}
