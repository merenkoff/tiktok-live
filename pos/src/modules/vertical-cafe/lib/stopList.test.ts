// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { deviceLocalDay, isStopListed } from './stopList';

describe('isStopListed', () => {
  it('compares the store day the server sent with the device’s own day', () => {
    expect(isStopListed({ stop_listed: true, stop_listed_on: '2026-09-20' }, '2026-09-20')).toBe(true);
    // Yesterday's snapshot un-greys at midnight without a refresh.
    expect(isStopListed({ stop_listed: true, stop_listed_on: '2026-09-19' }, '2026-09-20')).toBe(false);
    expect(isStopListed({ stop_listed: false, stop_listed_on: null }, '2026-09-20')).toBe(false);
  });

  it('falls back to the verdict on a snapshot old enough to carry no day', () => {
    expect(isStopListed({ stop_listed: true }, '2026-09-20')).toBe(true);
    expect(isStopListed({}, '2026-09-20')).toBe(false);
  });

  it('reads the device day as YYYY-MM-DD', () => {
    expect(deviceLocalDay(new Date(2026, 8, 20, 12, 0, 0))).toBe('2026-09-20');
    expect(deviceLocalDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
