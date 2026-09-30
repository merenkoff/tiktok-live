// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeCustomer } from '../test/utils';
import {
  cartDiscountLabel,
  customerDiscountPercent,
  discountAfterCustomerChange,
  isCustomerDiscount,
} from './customerDiscount';

const gold = makeCustomer({ id: 1, discount_percent: 10 });
const silver = makeCustomer({ id: 2, discount_percent: 5 });
const plain = makeCustomer({ id: 3, discount_percent: 0 });

describe('customerDiscountPercent', () => {
  it('reads a whole percent', () => {
    expect(customerDiscountPercent(gold)).toBe(10);
  });

  it('reads no customer, no field, junk and out-of-range as a clamped whole percent', () => {
    expect(customerDiscountPercent(null)).toBe(0);
    expect(customerDiscountPercent(undefined)).toBe(0);
    // A till that cached its customers before the field existed.
    expect(customerDiscountPercent({ ...gold, discount_percent: undefined })).toBe(0);
    expect(customerDiscountPercent({ ...gold, discount_percent: Number.NaN })).toBe(0);
    expect(customerDiscountPercent({ ...gold, discount_percent: '10' as unknown as number })).toBe(0);
    expect(customerDiscountPercent({ ...gold, discount_percent: 150 })).toBe(100);
    expect(customerDiscountPercent({ ...gold, discount_percent: -4 })).toBe(0);
    expect(customerDiscountPercent({ ...gold, discount_percent: 7.6 })).toBe(8);
  });
});

describe('isCustomerDiscount', () => {
  it('is true for exactly the percent on the customer\'s card', () => {
    expect(isCustomerDiscount({ type: 'percent', value: 10 }, gold)).toBe(true);
  });

  it('is false for another percent, a fixed sum, nothing, or a customer with no discount', () => {
    expect(isCustomerDiscount({ type: 'percent', value: 7 }, gold)).toBe(false);
    expect(isCustomerDiscount({ type: 'fixed', value: 10 }, gold)).toBe(false);
    expect(isCustomerDiscount(null, gold)).toBe(false);
    expect(isCustomerDiscount({ type: 'percent', value: 10 }, plain)).toBe(false);
    expect(isCustomerDiscount({ type: 'percent', value: 10 }, null)).toBe(false);
  });
});

describe('discountAfterCustomerChange', () => {
  it('puts the customer\'s percent in when the cart had no discount', () => {
    expect(discountAfterCustomerChange(null, null, gold)).toEqual({ type: 'percent', value: 10 });
  });

  it('puts nothing in for a customer with no discount', () => {
    expect(discountAfterCustomerChange(null, null, plain)).toBeNull();
  });

  it('swaps the previous customer\'s discount for the next one\'s', () => {
    expect(discountAfterCustomerChange({ type: 'percent', value: 10 }, gold, silver)).toEqual({
      type: 'percent',
      value: 5,
    });
  });

  it('takes the previous customer\'s discount off when the customer goes, and only theirs', () => {
    expect(discountAfterCustomerChange({ type: 'percent', value: 10 }, gold, null)).toBeNull();
    expect(discountAfterCustomerChange({ type: 'percent', value: 10 }, gold, plain)).toBeNull();
  });

  it('never replaces a discount the cashier put in themselves', () => {
    const oneOff = { type: 'fixed', value: 5000 } as const;
    expect(discountAfterCustomerChange(oneOff, null, gold)).toBe(oneOff);
    expect(discountAfterCustomerChange(oneOff, gold, silver)).toBe(oneOff);
    expect(discountAfterCustomerChange(oneOff, gold, null)).toBe(oneOff);
    const otherPercent = { type: 'percent', value: 15 } as const;
    expect(discountAfterCustomerChange(otherPercent, gold, silver)).toBe(otherPercent);
  });
});

describe('cartDiscountLabel', () => {
  it('names the customer\'s discount as theirs, and anything else as the cart\'s', () => {
    expect(cartDiscountLabel({ type: 'percent', value: 10 }, gold)).toBe('Знижка клієнта 10%');
    expect(cartDiscountLabel({ type: 'percent', value: 12 }, gold)).toBe('Знижка на чек');
    expect(cartDiscountLabel({ type: 'fixed', value: 1000 }, gold)).toBe('Знижка на чек');
    expect(cartDiscountLabel({ type: 'percent', value: 10 }, null)).toBe('Знижка на чек');
    expect(cartDiscountLabel(null, gold)).toBe('Знижка на чек');
  });
});
