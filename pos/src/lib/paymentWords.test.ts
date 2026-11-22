// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Rows 18 and 19 of the fiscal receipt (Положення № 13 after наказ № 601). The
// thermal printer's copy in receipt.rs is pinned to the same table by its own
// test `payment_words_follow_the_regulation_and_cashalots_examples`.

import { describe, expect, it } from 'vitest';
import { paymentWords, withCurrency } from './paymentWords';

const CASES: Array<[string, string, string]> = [
  ['cash', 'ГОТІВКА', 'Готівкові кошти'],
  ['card', 'БЕЗГОТІВКОВА', 'Картка'],
  ['qr', 'БЕЗГОТІВКОВА', 'Переказ за QR-кодом'],
  ['voucher', 'ІНШЕ', 'voucher'],
];

describe('paymentWords', () => {
  it.each(CASES)('%s → «%s» / «%s»', (method, form, means) => {
    expect(paymentWords(method)).toEqual({ form, means });
  });

  it('prints only the three forms the regulation names', () => {
    for (const [method] of CASES) {
      expect(['ГОТІВКА', 'БЕЗГОТІВКОВА', 'ІНШЕ']).toContain(paymentWords(method).form);
    }
  });

  it('puts the currency after the sum', () => {
    expect(withCurrency('206.08')).toBe('206.08 ГРН');
  });
});
