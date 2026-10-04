// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { SaleDetail } from '../../../types';
import {
  daysSincePurchase,
  defaultRefundMethod,
  needsAct,
  paidMethods,
  reasonLabel,
  refundErrorText,
  REFUND_REASONS,
} from './refundReasons';

const detail = (methods: Array<'cash' | 'card' | 'qr'>): SaleDetail =>
  ({ payments: methods.map((method, i) => ({ id: i + 1, method, amount_cents: 100 })) }) as SaleDetail;

describe('refund reasons', () => {
  it('names the five grounds, defect among them, and labels a code', () => {
    expect(REFUND_REASONS.map((r) => r.code)).toEqual(['size', 'color', 'style', 'defect', 'other']);
    expect(reasonLabel('defect')).toBe('Брак');
    expect(reasonLabel(null)).toBeNull();
    expect(reasonLabel(undefined)).toBeNull();
  });

  it('wants the act strictly above 100 ₴ (Порядок № 547 розд. ІІІ п. 8)', () => {
    expect(needsAct(100_00)).toBe(false);
    expect(needsAct(100_01)).toBe(true);
    expect(needsAct(0)).toBe(false);
  });

  it('counts calendar days without the day of purchase (ст. 9)', () => {
    const now = new Date(2026, 9, 15, 9, 30);
    expect(daysSincePurchase(new Date(2026, 9, 15, 8, 0).toISOString(), now)).toBe(0);
    expect(daysSincePurchase(new Date(2026, 9, 14, 23, 59).toISOString(), now)).toBe(1);
    expect(daysSincePurchase(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe(14);
    expect(daysSincePurchase(new Date(2026, 8, 30, 12, 0).toISOString(), now)).toBe(15);
    expect(daysSincePurchase('not a date', now)).toBe(0);
  });

  it('offers only the methods the receipt was paid with, in the till order, each once', () => {
    expect(paidMethods(detail(['card', 'cash', 'card']))).toEqual(['cash', 'card']);
    expect(paidMethods(detail(['qr']))).toEqual(['qr']);
    expect(paidMethods(detail([]))).toEqual([]);
    expect(paidMethods(null)).toEqual([]);
    expect(defaultRefundMethod(detail(['card']))).toBe('card');
    expect(defaultRefundMethod(detail([]))).toBe('cash');
  });

  it('shows the server\'s own sentence for a refused refund, never the HTTP status', () => {
    expect(
      refundErrorText(
        { response: { data: { error: 'Чек оплачено карткою — повернення теж на картку' } } },
        'fallback'
      )
    ).toBe('Чек оплачено карткою — повернення теж на картку');
    expect(refundErrorText(new Error('Request failed with status code 400'), 'fallback')).toBe('fallback');
    expect(refundErrorText(new Error('Повернення потребує інтернету'), 'fallback')).toBe(
      'Повернення потребує інтернету'
    );
    expect(refundErrorText(undefined, 'fallback')).toBe('fallback');
  });
});
