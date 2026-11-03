// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/registers.ts
//
// Which of a store's ПРРО registers we mean (track ДК, TechDocs/POS_DUAL_REGISTER.md).
// Register 1 is `pos_fiscal_settings` and always was; registers 2.. are rows of
// `pos_fiscal_registers` (migration 088). Everything that already keyed by
// `cash_register_key` — shifts, the offline tables, the rate limiter — keeps
// doing so, and this file is the one place that turns a register number into
// that key and back.

/** The highest register a request may name. The model takes more; the screens do not. */
export const MAX_REGISTER_NO = 2;

const RESERVED_KEY_RE = /^r(\d+)$/;

/**
 * A register number from a query string or a body field, or null when it is
 * not one we serve. Absent means register 1 — every client older than ДК1.
 */
export function parseRegisterNo(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return 1;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_REGISTER_NO ? n : null;
}

/**
 * The register's `cash_register_key`: register 1 keeps its provider's own key
 * from `config.cashRegisterKey` (or ''), exactly as before ДК1; register N ≥ 2
 * is `r<N>`, a value register 1 is refused ({@link isReservedRegisterKey}).
 */
export function registerKeyOf(
  registerNo: number,
  config: Readonly<Record<string, unknown>>
): string {
  if (registerNo >= 2) return `r${registerNo}`;
  const value = config.cashRegisterKey;
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

/** The register a `cash_register_key` belongs to — for code that only holds a shift row. */
export function registerNoOfKey(key: string | null | undefined): number {
  const match = RESERVED_KEY_RE.exec(key ?? '');
  const n = match ? Number(match[1]) : 1;
  return n >= 2 ? n : 1;
}

/** `r<number>` belongs to registers 2.., so register 1's own key may not look like it. */
export function isReservedRegisterKey(key: unknown): boolean {
  return typeof key === 'string' && RESERVED_KEY_RE.test(key.trim());
}

/**
 * What the secrets envelope is bound to besides the store (its AAD): the
 * provider for register 1, as before, and `<provider>:r<N>` for the others —
 * so one register's credentials can never be read as another's.
 */
export function secretsScope(provider: string, registerNo: number): string {
  return registerNo >= 2 ? `${provider}:r${registerNo}` : provider;
}

/**
 * SQL that matches a register's shifts by key, for queries that only know the
 * store: `cash_register_key = 'r<N>'`, or for register 1 everything that is not
 * such a key. `param` is the placeholder (`$2`) the caller binds `registerNo` to.
 */
export function shiftKeyMatchesSql(column: string, param: string): string {
  return `(CASE WHEN ${param}::int >= 2 THEN ${column} = 'r' || ${param}::int
                ELSE ${column} !~ '^r[0-9]+$' END)`;
}
