// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.core.test.ts
//
// The fiscal error taxonomy, the provider registry, and the receipt rate
// limiter. No database, no network.
//
// These three are the contract everything else in `src/pos/fiscal/` is written
// against, so they are pinned here before any orchestration depends on them.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  asFiscalError,
  cashierMessage,
  FiscalError,
  isDuplicate,
  isFiscalError,
  isRecoverable,
  isRetryable,
  isTerminal,
  supportCode,
  type FiscalErrorKind,
} from '../pos/fiscal/errors.js';
import {
  getProvider,
  hasProvider,
  registerProvider,
  resetProviders,
} from '../pos/fiscal/providers/index.js';
import { checkboxProvider } from '../pos/fiscal/providers/checkbox/index.js';
import {
  awaitSlot,
  RATE_LIMIT_DECLINED,
  reserveSlot,
  resetRateLimiter,
} from '../pos/fiscal/rateLimit.js';
import { FakeFiscalProvider, fakeCallCtx } from './helpers/fake-fiscal-provider.js';

const ALL_KINDS: FiscalErrorKind[] = [
  'not_configured',
  'auth_rejected',
  'rejected',
  'auth_expired',
  'shift_closed',
  'shift_expired',
  'rate_limited',
  'unavailable',
  'unknown',
  'duplicate',
];

describe('fiscal error taxonomy', () => {
  it('sorts every kind into exactly one class', () => {
    // The orchestrator branches on these four predicates and nothing else, so a
    // kind belonging to none (or two) of them would silently fall through.
    for (const kind of ALL_KINDS) {
      const classes = [
        isTerminal(kind),
        isRecoverable(kind),
        isRetryable(kind),
        isDuplicate(kind),
      ].filter(Boolean);
      expect(classes, `kind "${kind}"`).toHaveLength(1);
    }
  });

  it('treats duplicate as neither retryable nor terminal', () => {
    // It is the success path — the provider already holds our document.
    expect(isDuplicate('duplicate')).toBe(true);
    expect(isRetryable('duplicate')).toBe(false);
    expect(isTerminal('duplicate')).toBe(false);
    expect(isRecoverable('duplicate')).toBe(false);
  });

  it('classifies the recoverable kinds as one-repair-then-retry', () => {
    expect(['auth_expired', 'shift_closed', 'shift_expired'].every(isRecoverable)).toBe(true);
  });

  it('carries provider detail for support', () => {
    const error = new FiscalError('nope', 'rate_limited', {
      providerCode: 'too_many',
      httpStatus: 429,
      retryAfterMs: 5000,
    });
    expect(isFiscalError(error)).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
    expect(supportCode(error)).toBe('FS-RATE-LIMITED-429');
  });

  it('falls back to the provider code when there is no status', () => {
    expect(supportCode(new FiscalError('x', 'rejected', { providerCode: 'bad_tax' }))).toBe(
      'FS-REJECTED-BAD_TAX'
    );
    expect(supportCode(new FiscalError('x', 'shift_closed'))).toBe('FS-SHIFT-CLOSED');
    expect(supportCode(new Error('boom'))).toBe('FS-INTERNAL');
  });

  it('gives the cashier an instruction for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(cashierMessage(kind), kind).toBeTruthy();
    }
  });

  describe('asFiscalError', () => {
    it('passes a FiscalError through unchanged', () => {
      const original = new FiscalError('x', 'rejected');
      expect(asFiscalError(original, 'fallback')).toBe(original);
    });

    it('maps an aborted/timed-out fetch to unavailable', () => {
      const timeout = new Error('timed out');
      timeout.name = 'TimeoutError';
      expect(asFiscalError(timeout, 'f').kind).toBe('unavailable');

      const aborted = new Error('aborted');
      aborted.name = 'AbortError';
      expect(asFiscalError(aborted, 'f').kind).toBe('unavailable');
    });

    it('maps a network TypeError to unavailable, and anything else to unknown', () => {
      expect(asFiscalError(new TypeError('fetch failed'), 'f').kind).toBe('unavailable');
      expect(asFiscalError(new SyntaxError('bad json'), 'f').kind).toBe('unknown');
      expect(asFiscalError('a string', 'f').kind).toBe('unknown');
    });
  });
});

describe('fiscal provider registry', () => {
  afterEach(() => resetProviders());

  it('ships the checkbox adapter, and no others yet', () => {
    expect(getProvider('checkbox')).toBe(checkboxProvider);
    expect(hasProvider('vchasno')).toBe(false);
    expect(hasProvider('echeck')).toBe(false);
  });

  it('throws not_configured rather than returning nothing', () => {
    // A store whose provider has no adapter must fail the pre-flight loudly; a
    // null here would fall through to an un-fiscalised sale.
    try {
      getProvider('vchasno');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isFiscalError(error) && error.kind).toBe('not_configured');
    }
  });

  it('installs and restores adapters', () => {
    const fake = new FakeFiscalProvider();
    registerProvider(fake);
    expect(getProvider('checkbox')).toBe(fake);
    resetProviders();
    expect(getProvider('checkbox')).toBe(checkboxProvider);
    expect(getProvider('checkbox')).not.toBe(fake);
  });
});

describe('receipt rate limiter', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    resetRateLimiter();
    now = 1_000_000;
  });

  it('lets the first two receipts through immediately', () => {
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
  });

  it('spaces the third by the refill interval', () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    // 2 tokens/sec means the next one is 500ms out — invisible at the till,
    // and far cheaper than Checkbox's 5-second block for exceeding the cap.
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(500);
  });

  it('queues concurrent callers behind each other instead of colliding', () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(500);
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(1000);
  });

  it('refills over time', () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    now += 1000;
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
  });

  it('keeps separate buckets per store and per register', () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    expect(reserveSlot(2, '', 'live', { now: clock })).toBe(0);
    expect(reserveSlot(1, 'REG-2', 'live', { now: clock })).toBe(0);
  });

  it('never lets a background drain starve a live checkout', () => {
    // The retry cron and a cashier share one bucket. With one token left the
    // cron must wait and the till must not.
    reserveSlot(1, '', 'live', { now: clock });
    expect(reserveSlot(1, '', 'background', { now: clock })).toBeGreaterThan(0);

    resetRateLimiter();
    reserveSlot(1, '', 'live', { now: clock });
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
  });

  it('awaitSlot grants at once when a token is free', async () => {
    await expect(awaitSlot(1, '', 'live', undefined, { now: clock })).resolves.toBe(true);
  });

  it('does not let a background drain starve the next live checkout', async () => {
    // The regression this exists for: `reserveSlot` used to consume a token
    // even when returning a wait, with no floor, so draining 20 background
    // documents drove `tokens` to about -18 and the next LIVE checkout was
    // quoted a ~9.5s wait — over the whole 9s fiscal budget, i.e. a 503 in
    // front of a customer, from the mechanism meant to prevent exactly that.
    for (let i = 0; i < 20; i++) {
      reserveSlot(1, '', 'background', { now: clock, maxWaitMs: 250 });
    }
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
  });

  it('declines a background slot rather than queueing, without taking a token', async () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    expect(reserveSlot(1, '', 'background', { now: clock, maxWaitMs: 250 })).toBe(
      RATE_LIMIT_DECLINED
    );
    await expect(
      awaitSlot(1, '', 'background', undefined, { now: clock, maxWaitMs: 250 })
    ).resolves.toBe(false);
    // The declines cost nothing, so a full second still buys exactly two slots.
    now += 1000;
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
    expect(reserveSlot(1, '', 'live', { now: clock })).toBe(0);
  });

  it('awaitSlot rejects on an already-aborted signal', async () => {
    reserveSlot(1, '', 'live', { now: clock });
    reserveSlot(1, '', 'live', { now: clock });
    await expect(
      awaitSlot(1, '', 'live', AbortSignal.abort(), { now: clock })
    ).rejects.toBeDefined();
  });
});

describe('fake provider', () => {
  it('answers duplicate for a repeated requestId, carrying the original doc id', async () => {
    // This is the behaviour phases 3 and 4 are proven against: a retry after a
    // timeout must recover the existing document, never fiscalise twice.
    const fake = new FakeFiscalProvider({ shiftOpen: true });
    const ctx = fakeCallCtx();
    const doc = {
      kind: 'sale' as const,
      requestId: 'req-1',
      ourNumber: 'R-1',
      cashierName: 'Оля',
      lines: [],
      payments: [],
      totalCents: 100,
      discountCents: 0,
    };

    const first = await fake.registerSale(ctx, doc);
    expect(first.fiscalCode).toBeTruthy();

    await expect(fake.registerSale(ctx, doc)).rejects.toMatchObject({
      kind: 'duplicate',
      existingProviderDocId: first.providerDocId,
    });
    expect(await fake.fetchDocument(ctx, first.providerDocId)).toEqual(first);
  });

  it('reports duplicate even when an error is queued', async () => {
    // A real provider that already holds the id says so regardless of what
    // else is wrong; orchestration tests rely on that ordering.
    const fake = new FakeFiscalProvider({ shiftOpen: true });
    const ctx = fakeCallCtx();
    const doc = {
      kind: 'sale' as const,
      requestId: 'req-2',
      ourNumber: 'R-2',
      cashierName: 'Оля',
      lines: [],
      payments: [],
      totalCents: 100,
      discountCents: 0,
    };
    await fake.registerSale(ctx, doc);
    fake.queueError('unavailable');
    await expect(fake.registerSale(ctx, doc)).rejects.toMatchObject({ kind: 'duplicate' });
  });

  it('refuses to register while the shift is closed, and accepts once opened', async () => {
    const fake = new FakeFiscalProvider();
    const ctx = fakeCallCtx();
    const doc = {
      kind: 'sale' as const,
      requestId: 'req-3',
      ourNumber: 'R-3',
      cashierName: 'Оля',
      lines: [],
      payments: [],
      totalCents: 100,
      discountCents: 0,
    };
    await expect(fake.registerSale(ctx, doc)).rejects.toMatchObject({ kind: 'shift_closed' });

    await fake.openShift(ctx, { autoCloseAt: new Date('2026-09-10T00:00:00Z') });
    expect(fake.shift?.autoCloseAt).toBe('2026-09-10T00:00:00.000Z');

    // Same requestId, but the first attempt never registered a document.
    const result = await fake.registerSale(ctx, doc);
    expect(result.fiscalCode).toBeTruthy();

    const closed = await fake.closeShift(ctx);
    expect(closed.status).toBe('closed');
    expect(closed.zReportText).toBe('FAKE Z-REPORT');
  });

  it('records every call for assertions', async () => {
    const fake = new FakeFiscalProvider({ shiftOpen: true });
    const ctx = fakeCallCtx();
    await fake.getShift();
    await fake.xReport();
    expect(fake.calls.map((c) => c.method)).toEqual(['getShift', 'xReport']);
    expect((await fake.probe(ctx.creds)).cashierName).toBe('Fake Cashier');
  });
});
