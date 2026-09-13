// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/limits.ts
//
// The tax office's second offline limit: **168 hours per calendar month** per
// ПРРО, alongside the 36 hours in a row that `OFFLINE_SESSION_MAX_MS` already
// guards (Положення № 13; TechDocs/POS_FISCAL_OFFLINE.md).
//
// The 36h one is a property of a single session and needs no history — the
// session row knows when it began. The monthly one is a property of the
// register's whole month, so it is a sum over every offline stretch it lived
// through: server-held (case B) and till-held (case C) alike, closed, stuck
// and still open.
//
// Where it bites is not where it is counted. The till is the one that has to
// refuse a sale, and it is offline when that happens — so the number travels
// to it with the lease (`offline/lease.ts`) and it counts the running stretch
// itself from there. The server checks it again where it can: before opening
// a session of its own, and on every sale inside one.

import { pool } from '../../../db.js';

/**
 * 168 hours, less an hour of margin.
 *
 * The margin is the same idea as the 36h one: a till that stops exactly at the
 * limit has already broken it by the time the last receipt prints. An hour is
 * also enough for a shop to notice the warning and do something about the
 * connection.
 */
export const OFFLINE_MONTH_MAX_MS = 168 * 60 * 60 * 1000 - 60 * 60 * 1000;

export interface OfflineMonthUsage {
  /** Milliseconds of offline selling this register has spent this month. */
  used_ms: number;
  /** What it is measured against — the constant above, on the wire for the till. */
  limit_ms: number;
  /** When the count was taken; the till adds its own running stretch to it. */
  measured_at: string;
  /** Start of the calendar month the count covers (Europe/Kyiv). */
  month_start: string;
}

/**
 * The first instant of the current Ukrainian calendar month.
 *
 * «Календарний місяць» is local, and Kyiv is one or two hours ahead of UTC
 * depending on the season, so a UTC month start would let an outage on the
 * night of the 1st count against the wrong month. `Intl` knows the offset;
 * doing the arithmetic by hand does not.
 */
export function kyivMonthStart(now: Date = new Date()): Date {
  const { year, month } = kyivParts(now);
  // Local midnight of the 1st as an instant. The offset at the 1st can differ
  // from the offset today — Ukraine moves its clocks in March and October —
  // so guess with today's offset and correct with the one actually in effect
  // at the guess. One correction is enough: the two differ by an hour at most.
  const naive = Date.UTC(year, month - 1, 1);
  const guess = new Date(naive - kyivOffsetMs(now));
  return new Date(naive - kyivOffsetMs(guess));
}

const KYIV_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function kyivParts(at: Date): { year: number; month: number; naive: number } {
  const parts = KYIV_PARTS.formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') === 24 ? 0 : get('hour'); // some ICU builds say 24:00
  return {
    year: get('year'),
    month: get('month'),
    naive: Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
  };
}

/** Kyiv's UTC offset in effect at `at` (+2h or +3h), from the zone database. */
function kyivOffsetMs(at: Date): number {
  return kyivParts(at).naive - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * How much of this month's offline allowance the register has spent.
 *
 * Every session of the month counts, whatever its status: `stuck` means the
 * replay needs a human, not that the shop was online. A session still open
 * counts up to `now`.
 *
 * One deliberate overcount: a closed session's `ended_at` is the moment the
 * replay finished, which can be later than the moment the network came back.
 * Erring high makes the till stop earlier than the law requires, which is the
 * safe direction, and the alternative — the last document's fiscal date —
 * would undercount a till that sold nothing for the last hours of an outage.
 */
export async function offlineMonthUsage(
  storeId: number,
  registerKey: string,
  now: Date = new Date()
): Promise<OfflineMonthUsage> {
  const monthStart = kyivMonthStart(now);
  const result = await pool.query(
    `SELECT COALESCE(SUM(GREATEST(
       EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, $3::timestamptz), $3::timestamptz)
                           - GREATEST(started_at, $4::timestamptz))), 0
     )), 0) AS used_seconds
     FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND cash_register_key = $2
       AND COALESCE(ended_at, $3::timestamptz) > $4::timestamptz
       AND started_at < $3::timestamptz`,
    [storeId, registerKey, now.toISOString(), monthStart.toISOString()]
  );
  const seconds = Number(result.rows[0]?.used_seconds ?? 0);
  return {
    used_ms: Math.max(0, Math.round(seconds * 1000)),
    limit_ms: OFFLINE_MONTH_MAX_MS,
    measured_at: now.toISOString(),
    month_start: monthStart.toISOString(),
  };
}

/** Has this register run out of offline hours for the month? */
export async function offlineMonthExhausted(
  storeId: number,
  registerKey: string,
  now: Date = new Date()
): Promise<boolean> {
  const usage = await offlineMonthUsage(storeId, registerKey, now);
  return usage.used_ms >= usage.limit_ms;
}
