// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/poll.ts
//
// Checkbox accepts a shift-open/shift-close/receipt-sell immediately (202/201)
// but only reaches a final state ~2s later. Nothing above this adapter
// (shifts.service.ts, fiscal.service.ts) knows how to wait for a pending
// provider state — every `FiscalProvider` method is awaited once and its
// result trusted as final. So the wait has to happen entirely inside one
// adapter method call, before it resolves.
//
// `signal` is always the caller's own budget (9s live checkout, 12s
// interactive shift routes, 20s the auto-close cron) — reused across every
// poll iteration, never re-wrapped in a fresh AbortSignal.timeout(). When it
// fires mid-poll, the in-flight fetch rejects with a TimeoutError/AbortError,
// which errors.ts's asFiscalError already maps to `unavailable` — nothing
// special needed here for that case.

/** Same abort-wiring pattern as rateLimit.ts's awaitSlot and fiscal.service.ts's sleep. */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Aborted'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Compromise interval: both shift and receipt transitions settled in ~2s in the sandbox. */
export const POLL_INTERVAL_MS = 500;

/**
 * Poll `fetchOnce` until `isSettled` says stop.
 *
 * No attempt counter, no separate timeout: `signal` already carries the
 * caller's real deadline, and a second time budget here would just be a
 * second, possibly-conflicting source of truth about the same deadline.
 */
export async function pollUntil<T>(
  signal: AbortSignal,
  fetchOnce: () => Promise<T>,
  isSettled: (value: T) => boolean,
  intervalMs: number = POLL_INTERVAL_MS
): Promise<T> {
  for (;;) {
    const value = await fetchOnce();
    if (isSettled(value)) return value;
    await delay(intervalMs, signal);
  }
}
