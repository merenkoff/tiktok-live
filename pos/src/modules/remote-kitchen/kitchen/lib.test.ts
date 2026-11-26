// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  clampPrep,
  clockOffset,
  defaultPrep,
  formatWait,
  guestMinutes,
  newIds,
  pendingRequests,
  secondsToAnswer,
} from './lib';
import type { RemoteRequest } from './remoteApi';

function req(over: Partial<RemoteRequest>): RemoteRequest {
  return {
    id: 1,
    status: 'requested',
    revision: 1,
    cafe_name: 'Парк',
    guest_label: null,
    note: null,
    prep_minutes: 15,
    load_minutes: 0,
    transit_minutes: 10,
    suggested_minutes: 25,
    answer_deadline_at: null,
    requested_at: '2026-11-24T18:00:00.000Z',
    items: [],
    ...over,
  };
}

describe('the kitchen’s request panel', () => {
  it('lists only what waits for an answer, oldest first', () => {
    const a = req({ id: 1, requested_at: '2026-11-24T18:02:00.000Z' });
    const b = req({ id: 2, status: 'quoted' });
    const c = req({ id: 3, requested_at: '2026-11-24T18:01:00.000Z' });
    expect(pendingRequests([a, b, c]).map((o) => o.id)).toEqual([3, 1]);
  });

  it('starts from the kitchen’s own numbers, without the road', () => {
    expect(defaultPrep({ prep_minutes: 40, load_minutes: 7 })).toBe(50);
    expect(defaultPrep({ prep_minutes: null, load_minutes: 0 })).toBe(20);
    expect(clampPrep(0)).toBe(5);
    expect(clampPrep(999)).toBe(180);
  });

  it('tells the cook what the guest will hear: cooking plus the road, up to five', () => {
    expect(guestMinutes(30, 10)).toBe(40);
    expect(guestMinutes(33, 10)).toBe(45);
    expect(guestMinutes(5, null)).toBe(5);
  });

  it('counts the time left to answer on the server’s clock', () => {
    const now = Date.parse('2026-11-24T18:00:00.000Z');
    expect(secondsToAnswer('2026-11-24T18:01:00.000Z', 0, now)).toBe(60);
    expect(secondsToAnswer('2026-11-24T18:01:00.000Z', 30000, now)).toBe(30);
    expect(secondsToAnswer('2026-11-24T17:59:00.000Z', 0, now)).toBe(0);
    expect(secondsToAnswer(null, 0, now)).toBeNull();
  });

  it('chimes once per new request', () => {
    expect(newIds(new Set([1]), [req({ id: 1 }), req({ id: 2 })])).toEqual([2]);
  });
});

describe('the strip’s clock', () => {
  it('writes the time left as minutes and seconds, hours only when there are any', () => {
    expect(formatWait(0)).toBe('0:00');
    expect(formatWait(59)).toBe('0:59');
    expect(formatWait(245)).toBe('4:05');
    expect(formatWait(3723)).toBe('1:02:03');
    expect(formatWait(-5)).toBe('0:00');
  });

  it('measures the device against the server’s `now`, and trusts nothing it cannot read', () => {
    expect(clockOffset('2026-11-25T10:00:05.000Z', Date.parse('2026-11-25T10:00:00.000Z'))).toBe(5000);
    expect(clockOffset(undefined, 1)).toBe(0);
    expect(clockOffset('не час', 1)).toBe(0);
  });
});

describe('time chips and grey cards (РК4)', () => {
  it('adds the kitchen’s own suggestion to the chips when it is not one of them', async () => {
    const { chipsFor } = await import('./lib');
    expect(chipsFor(20)).toEqual([15, 20, 25, 30, 40, 50]);
    expect(chipsFor(35)).toEqual([15, 20, 25, 30, 35, 40, 50]);
  });

  it('keeps only the server’s own times the guest may still agree to', async () => {
    const { autoConfirmed } = await import('./lib');
    const base = {
      revision: 1,
      cafe_name: 'Парк',
      guest_label: null,
      note: null,
      prep_minutes: 15,
      load_minutes: 0,
      transit_minutes: 10,
      suggested_minutes: 25,
      answer_deadline_at: null,
      requested_at: '2026-11-25T18:00:00Z',
      items: [],
    };
    const now = Date.parse('2026-11-25T18:01:00Z');
    const list = autoConfirmed(
      [
        { ...base, id: 1, status: 'quoted', quote_source: 'auto', quote_expires_at: '2026-11-25T18:03:00Z' },
        { ...base, id: 2, status: 'quoted', quote_source: 'auto', quote_expires_at: '2026-11-25T18:00:30Z' },
        { ...base, id: 3, status: 'quoted', quote_source: 'kitchen', quote_expires_at: '2026-11-25T18:03:00Z' },
        { ...base, id: 4, status: 'cooking', quote_source: 'auto', quote_expires_at: '2026-11-25T18:03:00Z' },
      ],
      0,
      now
    );
    expect(list.map((o) => o.id)).toEqual([1]);
  });
});
