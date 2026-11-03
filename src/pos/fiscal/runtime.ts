// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/runtime.ts
//
// Per-register in-memory cache of the provider session and the shift state —
// per store, and since ДК1 per register of the store (POS_DUAL_REGISTER.md): two
// Cashalot registers of one store have two shifts and two licences.
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

const runtimes = new Map<string, RuntimeEntry>();

/**
 * Which register's entry: a bare store id is its register 1 (every caller
 * from before ДК1), a `FiscalContext` names its own.
 */
export type RuntimeRef = number | { storeId: number; registerNo?: number };

function keyOf(ref: RuntimeRef): string {
  return typeof ref === 'number' ? `${ref}:1` : `${ref.storeId}:${ref.registerNo ?? 1}`;
}

/** Last time the register holder's `last_seen_at` was written, per store. */
const holderTouchedAt = new Map<number, number>();

/** How often at most `holder_last_seen_at` is written for a busy till. */
export const HOLDER_TOUCH_INTERVAL_MS = 60_000;

/**
 * True once per {@link HOLDER_TOUCH_INTERVAL_MS} per store — the holder's
 * heartbeat is written by every status poll and every checkout, and a write
 * per request would be a hot-path UPDATE for a value nobody reads that often.
 */
export function shouldTouchHolder(storeId: number, now = Date.now()): boolean {
  const last = holderTouchedAt.get(storeId) ?? 0;
  if (now - last < HOLDER_TOUCH_INTERVAL_MS) return false;
  holderTouchedAt.set(storeId, now);
  return true;
}

function entryFor(ref: RuntimeRef): RuntimeEntry {
  const key = keyOf(ref);
  let entry = runtimes.get(key);
  if (!entry) {
    entry = { session: null, shift: null, shiftCheckedAtMs: 0, lastOkAtMs: null };
    runtimes.set(key, entry);
  }
  return entry;
}

/** The cached session, or null when absent or too close to expiry. */
export function getCachedSession(ref: RuntimeRef, now = Date.now()): FiscalSession | null {
  const { session } = entryFor(ref);
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() - SESSION_SKEW_MS <= now) return null;
  return session;
}

export function setCachedSession(ref: RuntimeRef, session: FiscalSession | null): void {
  entryFor(ref).session = session;
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
  ref: RuntimeRef,
  maxAgeMs = SHIFT_TTL_MS,
  now = Date.now()
): FiscalShiftState | null {
  const entry = entryFor(ref);
  if (!entry.shift) return null;
  if (now - entry.shiftCheckedAtMs > maxAgeMs) return null;
  return entry.shift;
}

export function setCachedShift(
  ref: RuntimeRef,
  shift: FiscalShiftState | null,
  now = Date.now()
): void {
  const entry = entryFor(ref);
  entry.shift = shift;
  entry.shiftCheckedAtMs = now;
}

export function markProviderOk(ref: RuntimeRef, now = Date.now()): void {
  entryFor(ref).lastOkAtMs = now;
}

export function lastProviderOkAt(ref: RuntimeRef): number | null {
  return entryFor(ref).lastOkAtMs;
}

/** Drop the session — after `auth_expired`, or when credentials change. */
export function invalidateSession(ref: RuntimeRef): void {
  entryFor(ref).session = null;
}

/** Drop the shift reading — after any `shift_*` error, or on close. */
export function invalidateShift(ref: RuntimeRef): void {
  const entry = entryFor(ref);
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
  const prefix = `${storeId}:`;
  for (const key of [...runtimes.keys()]) {
    if (key.startsWith(prefix)) runtimes.delete(key);
  }
  holderTouchedAt.delete(storeId);
}

/** Test seam — the maps are process-global. */
export function resetRuntime(): void {
  runtimes.clear();
  holderTouchedAt.clear();
}
