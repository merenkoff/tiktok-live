// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/dates.ts
//
// Dates as Cashalot gives them → ISO-8601 for `pos_fiscal_receipts.fiscal_date`
// (a `timestamptz`: a string Postgres cannot read would fail `markDone`).
// The ДПС document itself carries Kyiv wall time (`ORDERDATE` ddmmyyyy,
// `ORDERTIME` hhmmss), and the WEB API's `OrderDateTime` format is not in the
// spec — ISO with an offset is taken as is, anything without one is read as
// Kyiv time, anything else is null rather than a guess.

import { kyivOffsetMs } from '../../offline/limits.js';

/** Kyiv wall time → the instant. Two passes, so a DST edge resolves to the right offset. */
export function kyivWallTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date | null {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(naive)) return null;
  const check = new Date(naive);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const guess = new Date(naive - kyivOffsetMs(new Date(naive)));
  return new Date(naive - kyivOffsetMs(guess));
}

const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const DOTTED = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** `OrderDateTime` → ISO, or null. */
export function parseCashalotDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (WITH_OFFSET.test(text)) {
    const at = new Date(text);
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
  }
  let m = LOCAL_ISO.exec(text);
  if (m) return kyivWallTime(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0))?.toISOString() ?? null;
  m = DOTTED.exec(text);
  if (m) return kyivWallTime(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] ?? 0))?.toISOString() ?? null;
  return null;
}

/** The ДПС pair `ORDERDATE` (ddmmyyyy) + `ORDERTIME` (hhmmss) → ISO, or null. */
export function parseDpsDateTime(date: string | null, time: string | null): string | null {
  if (!date || !/^\d{8}$/.test(date)) return null;
  const t = time && /^\d{6}$/.test(time) ? time : '000000';
  return (
    kyivWallTime(+date.slice(4, 8), +date.slice(2, 4), +date.slice(0, 2), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6))?.toISOString() ??
    null
  );
}
