import { describe, expect, it } from 'vitest';
import { eachDate } from '../pos/analytics.service.js';

describe('POS analytics eachDate', () => {
  it('returns a single date when from equals to', () => {
    expect(eachDate('2026-08-24', '2026-08-24')).toEqual(['2026-08-24']);
  });

  it('returns every date in an inclusive range', () => {
    expect(eachDate('2026-08-24', '2026-08-27')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
    ]);
  });

  it('handles ranges that cross a month boundary', () => {
    expect(eachDate('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('handles ranges that cross a year boundary', () => {
    expect(eachDate('2025-12-30', '2026-01-01')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ]);
  });
});
