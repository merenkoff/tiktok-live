// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { ordersText } from './plural';
import { dishTime } from '../admin/dishTime';

describe('ordersText', () => {
  it.each([
    [1, '1 замовлення'],
    [5, '5 замовлень'],
    [11, '11 замовлень'],
    [14, '14 замовлень'],
    [21, '21 замовлення'],
    [22, '22 замовлення'],
    [25, '25 замовлень'],
    [112, '112 замовлень'],
  ])('%i → %s', (n, text) => {
    expect(ordersText(n)).toBe(text);
  });
});

describe('dishTime', () => {
  it('says the measured time with how many orders measured it, else the card’s, else nothing', () => {
    expect(dishTime({ prep_minutes: 40, measured_minutes: 27, measured_orders: 22 })).toBe('≈27 хв за 22 замовлення');
    expect(dishTime({ prep_minutes: 40, measured_minutes: null, measured_orders: 0 })).toBe('≈40 хв');
    expect(dishTime({ prep_minutes: 40 })).toBe('≈40 хв');
    expect(dishTime({ prep_minutes: null })).toBe('');
  });
});
