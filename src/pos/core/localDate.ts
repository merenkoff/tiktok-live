// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/localDate.ts — «today» as the store sees it.
//
// A store closes at midnight in Kyiv, not in UTC: a sale at 01:30 belongs to
// the new day's takings and gets the new day's first order number. Every
// «what day is it» in the POS goes through the store's `pos_stores.timezone`
// and this one function, so the analytics day and the order counter's day
// cannot disagree.

/** `YYYY-MM-DD` of `at` (default now) in the given IANA timezone. */
export function localDateString(timezone: string, at: Date = new Date()): string {
  // en-CA formats as ISO `YYYY-MM-DD`, which is what the counters and the
  // analytics ranges key on.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

/**
 * `YYYY-MM-DD` and a day that exists — `2026-13-40` is not one. Routes check
 * a typed day with this before it reaches a `::date` cast, which would answer
 * a 500 instead of a sentence.
 */
export function isLocalDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
