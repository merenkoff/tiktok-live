// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { withTimeout, MODULE_LOAD_TIMEOUT_MS } from './withTimeout';

// Real timers throughout: the "settles before the deadline" cases never touch
// `setTimeout`'s callback at all (they resolve/reject on their own), and
// mixing `vi.useFakeTimers()` with an already-rejected/rejecting inner promise
// here trips vitest's unhandled-rejection detector on an otherwise-correctly-
// handled rejection (`promise.then(ok, onRejected)` already counts as
// handling it) — a harness quirk, not a `withTimeout` bug; confirmed the exact
// same sequence under plain Node with no such warning. Only the "never
// settles" case genuinely needs to fast-forward a clock, so it's the one test
// that opts into fake timers, scoped to just itself.
describe('withTimeout', () => {
  it('resolves with the inner value when it settles before the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'thing')).resolves.toBe('ok');
  });

  it('propagates the inner rejection when it fails before the deadline', async () => {
    const inner = (async () => {
      throw new Error('boom');
    })();
    await expect(withTimeout(inner, 1000, 'thing')).rejects.toThrow('boom');
  });

  it('rejects on its own once the deadline passes, for a promise that never settles', async () => {
    // The whole point: a hung invoke/fetch/import with no cancellation API
    // must not be able to block the caller forever.
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const result = withTimeout(never, 1000, 'stuck thing');
      const assertion = expect(result).rejects.toThrow('stuck thing timed out after 1000ms');
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire the timeout after an early resolution (no dangling rejection)', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      await withTimeout(Promise.resolve('fast'), 20, 'thing');
      await new Promise((r) => setTimeout(r, 40));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('exports a sane default budget for the module-remote boot path', () => {
    expect(MODULE_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MODULE_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
