// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/offline/outboxPolicy.test.ts
//
// The two properties the outbox lacked before this module existed:
//   * a rejected row eventually stops being retried, instead of re-POSTing
//     every 30 seconds forever;
//   * the backoff actually delays, instead of being measured from a creation
//     time that stops mattering after the first minute.

import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  backoff,
  classifySyncError,
  dueAt,
  isDue,
  nextRowState,
} from './outboxPolicy';
import type { OutboxRow } from './db';

function httpError(status: number, data: unknown = {}): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_RESPONSE');
  error.response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'row-1',
  type: 'sale',
  clientUuid: 'uuid-1',
  payload: { client_uuid: 'uuid-1' } as OutboxRow['payload'],
  status: 'error',
  attempts: 1,
  createdAt: 1_000_000,
  ...over,
});

describe('backoff scheduling', () => {
  it('measures from the last attempt, not from creation', () => {
    // The bug this replaces: with the delay measured from `createdAt` and the
    // table topping out at 60s, every row older than a minute was due on every
    // single tick — a permanent 30s retry storm.
    const created = 1_000_000;
    const attempted = created + 10 * 60 * 1000;
    expect(dueAt(row({ createdAt: created, attempts: 4, lastAttemptAt: attempted }))).toBe(
      attempted + backoff(4)
    );
  });

  it('falls back to createdAt for rows written by older builds', () => {
    expect(dueAt(row({ createdAt: 500, attempts: 0, lastAttemptAt: undefined }))).toBe(
      500 + backoff(0)
    );
  });

  it('saturates the backoff table rather than indexing past it', () => {
    expect(backoff(99)).toBe(backoff(4));
  });

  it('never schedules a dead row', () => {
    expect(isDue(row({ status: 'dead', attempts: 0, lastAttemptAt: 0 }), 9_999_999_999)).toBe(
      false
    );
  });

  it('runs a pending row immediately', () => {
    expect(isDue(row({ status: 'pending' }), 0)).toBe(true);
  });

  it('holds an errored row until its delay elapses', () => {
    const r = row({ attempts: 0, lastAttemptAt: 1_000_000 });
    expect(isDue(r, 1_000_000 + backoff(0) - 1)).toBe(false);
    expect(isDue(r, 1_000_000 + backoff(0))).toBe(true);
  });
});

describe('classifySyncError', () => {
  it('treats a network failure as transient', () => {
    const network = new AxiosError('Network Error');
    expect(classifySyncError(network, 'sale').terminal).toBe(false);
  });

  it('treats an expired session as transient', () => {
    // The drain stops on 401 rather than marking every row; if it did mark
    // them, one expired token would exhaust the whole queue's attempts.
    expect(classifySyncError(httpError(401), 'sale').terminal).toBe(false);
  });

  it('treats 502 and 503 as transient — the next attempt disambiguates them', () => {
    // 503 wrote nothing; a 502 that kept the sale replays into a 200; a 502
    // that voided it replays into a 409. So the sync path never needs to read
    // `sale_voided` at all.
    expect(classifySyncError(httpError(503, { error: 'fiscal_unavailable' }), 'sale').terminal).toBe(
      false
    );
    expect(classifySyncError(httpError(502, { error: 'fiscal_failed' }), 'sale').terminal).toBe(
      false
    );
  });

  it('treats 429 as transient', () => {
    expect(classifySyncError(httpError(429), 'sale').terminal).toBe(false);
  });

  it('gives up on a voided replay, and does not hand stock back', () => {
    const verdict = classifySyncError(
      httpError(409, { error: 'sale_voided_not_fiscalised' }),
      'sale'
    );
    expect(verdict).toMatchObject({ terminal: true, reason: 'sale_voided', nothingWritten: false });
    // The server's own void already returned the stock there.
  });

  it('gives up on a validation rejection, and does hand stock back', () => {
    const verdict = classifySyncError(httpError(400, { error: 'Not enough stock' }), 'sale');
    expect(verdict).toMatchObject({ terminal: true, reason: 'rejected', nothingWritten: true });
  });

  it('labels the message by document type', () => {
    expect(classifySyncError(httpError(400, {}), 'sale').message).toMatch(/^Чек:/);
    expect(classifySyncError(httpError(400, {}), 'customer').message).toMatch(/^Клієнт:/);
  });
});

describe('nextRowState', () => {
  it('keeps a transient failure retryable', () => {
    const next = nextRowState(row({ attempts: 2 }), { terminal: false, message: 'x' }, 5_000);
    expect(next).toMatchObject({ status: 'error', attempts: 3, lastAttemptAt: 5_000 });
    expect(next.deadReason).toBeUndefined();
  });

  it('marks a terminal failure dead immediately', () => {
    const next = nextRowState(
      row({ attempts: 0 }),
      { terminal: true, reason: 'rejected', nothingWritten: true, message: 'x' },
      1
    );
    expect(next).toMatchObject({ status: 'dead', deadReason: 'rejected', nothingWritten: true });
  });

  it('gives up once the attempt budget is spent', () => {
    const next = nextRowState(
      row({ attempts: MAX_ATTEMPTS - 1 }),
      { terminal: false, message: 'x' },
      1
    );
    expect(next).toMatchObject({ status: 'dead', deadReason: 'attempts_exhausted' });
    // Exhaustion says nothing about what the server did, so stock stays put.
    expect(next.nothingWritten).toBe(false);
  });
});
