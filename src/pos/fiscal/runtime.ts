// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/runtime.ts
//
// Per-store in-memory cache of the provider session and the shift state.
//
// Why this exists: the checkout pre-flight runs on every sale. Asking the
// provider "is a shift open?" each time would add a network round trip to the
// hot path and spend half the 2-receipts/sec budget on a question whose answer
// changes twice a day.
//
// Same posture as `sessionManager`'s in-memory map and `qr.service.ts`'s
// limiter: process-local, rebuilt from the provider after a restart, and
// correct-if-stale because every cached value is re-validated by the provider
// the moment a call actually fails (`shift_closed` / `auth_expired` invalidate
// their own entry, and the orchestrator gets one repair-and-retry).

import type { FiscalSession, FiscalShiftState } from './types.js';

/** How long a shift reading is trusted without re-asking the provider. */
export const SHIFT_TTL_MS = 60_000;

/**
 * Re-sign-in this long before the session's own expiry.
 *
 * A token that expires mid-checkout costs the customer a retry, so we spend a
 * cheap sign-in early instead.
 */
const SESSION_SKEW_MS = 60_000;

interface RuntimeEntry {
  session: FiscalSession | null;
  shift: FiscalShiftState | null;
  shiftCheckedAtMs: number;
  /** Last time any provider call for this store succeeded. Diagnostics only. */
  lastOkAtMs: number | null;
}

const runtimes = new Map<number, RuntimeEntry>();

function entryFor(storeId: number): RuntimeEntry {
  let entry = runtimes.get(storeId);
  if (!entry) {
    entry = { session: null, shift: null, shiftCheckedAtMs: 0, lastOkAtMs: null };
    runtimes.set(storeId, entry);
  }
  return entry;
}

/** The cached session, or null when absent or too close to expiry. */
export function getCachedSession(storeId: number, now = Date.now()): FiscalSession | null {
  const { session } = entryFor(storeId);
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() - SESSION_SKEW_MS <= now) return null;
  return session;
}

export function setCachedSession(storeId: number, session: FiscalSession | null): void {
  entryFor(storeId).session = session;
}

/**
 * The cached shift, or null when absent or older than `maxAgeMs`.
 *
 * Note the deliberate ambiguity: "no cached reading" and "the provider said
 * there is no shift" both come back as null. Callers want the same thing in
 * both cases — ask the provider — so distinguishing them would only add a
 * branch nobody uses.
 */
export function getCachedShift(
  storeId: number,
  maxAgeMs = SHIFT_TTL_MS,
  now = Date.now()
): FiscalShiftState | null {
  const entry = entryFor(storeId);
  if (!entry.shift) return null;
  if (now - entry.shiftCheckedAtMs > maxAgeMs) return null;
  return entry.shift;
}

export function setCachedShift(
  storeId: number,
  shift: FiscalShiftState | null,
  now = Date.now()
): void {
  const entry = entryFor(storeId);
  entry.shift = shift;
  entry.shiftCheckedAtMs = now;
}

export function markProviderOk(storeId: number, now = Date.now()): void {
  entryFor(storeId).lastOkAtMs = now;
}

export function lastProviderOkAt(storeId: number): number | null {
  return entryFor(storeId).lastOkAtMs;
}

/** Drop the session — after `auth_expired`, or when credentials change. */
export function invalidateSession(storeId: number): void {
  entryFor(storeId).session = null;
}

/** Drop the shift reading — after any `shift_*` error, or on close. */
export function invalidateShift(storeId: number): void {
  const entry = entryFor(storeId);
  entry.shift = null;
  entry.shiftCheckedAtMs = 0;
}

/**
 * Forget everything about a store.
 *
 * Called when its fiscal settings are written: a cached session belongs to the
 * provider and credentials it was minted for, and silently reusing it after the
 * owner switched providers would send a Checkbox token to Вчасно.
 */
export function invalidateStore(storeId: number): void {
  runtimes.delete(storeId);
}

/** Test seam — the map is process-global. */
export function resetRuntime(): void {
  runtimes.clear();
}
