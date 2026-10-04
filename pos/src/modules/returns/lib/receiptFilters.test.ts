// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { localDay, periodFrom } from './receiptFilters';

describe('periodFrom', () => {
  const noon = new Date(2026, 9, 4, 12, 0, 0); // local time, so the day is stable

  it('is nothing for «Усі», today for «Сьогодні», six days back for «7 днів»', () => {
    expect(periodFrom('all', noon)).toBeUndefined();
    expect(periodFrom('today', noon)).toBe(localDay(noon));
    expect(periodFrom('week', noon)).toBe(localDay(new Date(2026, 8, 28, 12)));
  });

  it('writes the day the way the server reads it', () => {
    expect(localDay(noon)).toBe('2026-10-04');
  });
});
