// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { advanceLocalOrderNo, deviceLocalDay, localOrderLabel } from './localOrderNo';

describe('advanceLocalOrderNo', () => {
  it('starts a day at 1 and counts on within it', () => {
    const first = advanceLocalOrderNo(undefined, '2026-09-21');
    expect(first).toEqual({ issued: 1, counter: { day: '2026-09-21', next: 2 } });
    const second = advanceLocalOrderNo(first.counter, '2026-09-21');
    expect(second).toEqual({ issued: 2, counter: { day: '2026-09-21', next: 3 } });
  });

  it('starts over at midnight — yesterday’s counter is a new day', () => {
    expect(advanceLocalOrderNo({ day: '2026-09-20', next: 18 }, '2026-09-21')).toEqual({
      issued: 1,
      counter: { day: '2026-09-21', next: 2 },
    });
  });

  it('treats a malformed counter as a new day rather than issuing nonsense', () => {
    expect(advanceLocalOrderNo({ day: '2026-09-21', next: 0 }, '2026-09-21').issued).toBe(1);
    expect(advanceLocalOrderNo({ day: '2026-09-21', next: 2.5 }, '2026-09-21').issued).toBe(1);
    expect(advanceLocalOrderNo(null, '2026-09-21').issued).toBe(1);
  });
});

describe('localOrderLabel', () => {
  it('always carries the letter, so «К17» is never mistaken for the server’s «17»', () => {
    expect(localOrderLabel(17)).toBe('К17');
    expect(localOrderLabel(1)).toBe('К1');
  });
});

describe('deviceLocalDay', () => {
  it('reads the device day as YYYY-MM-DD', () => {
    expect(deviceLocalDay(new Date(2026, 8, 21, 0, 30, 0))).toBe('2026-09-21');
    expect(deviceLocalDay(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
    expect(deviceLocalDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
