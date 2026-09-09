// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/rateLimit.ts
//
// Token bucket for provider receipt calls, keyed per cash register.
//
// Checkbox caps receipts at 2/sec per register and answers a burst by blocking
// transmission for 5 seconds — far worse for a cashier than waiting 500ms. So
// we shape the traffic ourselves instead of discovering the cap.
//
// In-process, like `qr.service.ts`'s limiter and `sessionManager`'s map. On a
// multi-replica deploy this degrades to N×2/sec rather than failing; the fix,
// if it ever bites, is Redis, which is already in the stack.

/** Provider ceiling. */
const DEFAULT_CAPACITY = 2;
const DEFAULT_REFILL_PER_SEC = 2;

/**
 * Tokens the retry cron may not touch.
 *
 * A backlog drain and a live checkout compete for the same bucket, and the
 * cashier standing at the till must always win. The cron takes a token only
 * when more than this many remain.
 */
const LIVE_RESERVE = 1;

export type FiscalCallPriority = 'live' | 'background';

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

function bucketKey(storeId: number, registerKey: string): string {
  return `${storeId}::${registerKey}`;
}

function refill(bucket: Bucket, now: number, capacity: number, perSec: number): void {
  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  if (elapsedSec <= 0) return;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * perSec);
  bucket.lastRefillMs = now;
}

export interface RateLimitOptions {
  capacity?: number;
  refillPerSec?: number;
  /** Injectable clock — the tests drive time rather than sleeping through it. */
  now?: () => number;
  /**
   * Give up instead of queueing when the wait would exceed this.
   *
   * The retry cron passes a small value. Without it, `LIVE_RESERVE` does not
   * actually protect the till: queued callers drive `tokens` negative without
   * bound, so a drain of 20 background documents leaves the next *live*
   * checkout computing a ~9.5s wait — over the whole fiscal budget, and a 503
   * in front of a customer. The reserve only works if the background caller
   * declines rather than takes a place in the queue.
   */
  maxWaitMs?: number;
}

/** `reserveSlot` returns this when the wait exceeds `maxWaitMs`. No token taken. */
export const RATE_LIMIT_DECLINED = -1;

/**
 * How long to wait before this call may go out, in milliseconds.
 *
 * Returns 0 when a token is free, a positive wait when the caller should sleep,
 * or {@link RATE_LIMIT_DECLINED} when `maxWaitMs` says it is not worth queueing.
 * Consumes the token in the first two cases, so a caller that asks must
 * actually make the call.
 */
export function reserveSlot(
  storeId: number,
  registerKey: string,
  priority: FiscalCallPriority = 'live',
  opts: RateLimitOptions = {}
): number {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const perSec = opts.refillPerSec ?? DEFAULT_REFILL_PER_SEC;
  const now = (opts.now ?? Date.now)();
  const key = bucketKey(storeId, registerKey);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }
  refill(bucket, now, capacity, perSec);

  const floor = priority === 'background' ? LIVE_RESERVE : 0;

  if (bucket.tokens >= floor + 1) {
    bucket.tokens -= 1;
    return 0;
  }

  // Not enough now — say when, and take the token for that moment so
  // concurrent callers queue behind each other instead of colliding.
  const deficit = floor + 1 - bucket.tokens;
  const waitMs = Math.ceil((deficit / perSec) * 1000);

  // Decline BEFORE consuming: a background caller that queued here would push
  // `tokens` further negative and lengthen the wait of every live checkout
  // behind it — the exact starvation `LIVE_RESERVE` exists to prevent.
  if (opts.maxWaitMs !== undefined && waitMs > opts.maxWaitMs) return RATE_LIMIT_DECLINED;

  bucket.tokens -= 1;
  return waitMs;
}

/**
 * `reserveSlot`, but actually waits. Aborts propagate.
 *
 * Returns false when the slot was declined (`maxWaitMs`) — the caller should
 * skip this document and come back on the next tick, not sleep.
 */
export async function awaitSlot(
  storeId: number,
  registerKey: string,
  priority: FiscalCallPriority = 'live',
  signal?: AbortSignal,
  opts: RateLimitOptions = {}
): Promise<boolean> {
  const waitMs = reserveSlot(storeId, registerKey, priority, opts);
  if (waitMs === RATE_LIMIT_DECLINED) return false;
  if (waitMs <= 0) return true;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, waitMs);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted while waiting for a fiscal rate-limit slot'));
    }
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  return true;
}

/** Test seam — buckets are process-global. */
export function resetRateLimiter(): void {
  buckets.clear();
}
