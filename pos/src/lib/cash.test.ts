// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { centsToPadText, padInput, quickCashAmounts } from './cash';
import { positionsText, ukPlural } from './plural';

describe('quickCashAmounts', () => {
  it('offers the exact sum and the three notes a customer pays with', () => {
    expect(quickCashAmounts(22_000)).toEqual([22_000, 30_000, 50_000, 100_000]);
    expect(quickCashAmounts(6_500)).toEqual([6_500, 10_000, 50_000, 100_000]);
    expect(quickCashAmounts(95_000)).toEqual([95_000, 100_000, 200_000, 500_000]);
  });

  it('never offers the exact sum twice when it is already round', () => {
    expect(quickCashAmounts(50_000)).toEqual([50_000, 60_000, 100_000, 200_000]);
  });

  it('keeps kopiykas in the exact sum', () => {
    expect(quickCashAmounts(21_950)[0]).toBe(21_950);
    expect(quickCashAmounts(21_950)[1]).toBe(30_000);
  });
});

describe('padInput', () => {
  it('replaces an amount the till put there, appends to a typed one', () => {
    expect(padInput('220', '5', true)).toBe('5');
    expect(padInput('5', '0', false)).toBe('50');
    expect(padInput('50', '0', false)).toBe('500');
  });

  it('takes one comma and two decimals', () => {
    expect(padInput('', ',', false)).toBe('0,');
    expect(padInput('12,', ',', false)).toBe('12,');
    expect(padInput('12,5', '0', false)).toBe('12,50');
    expect(padInput('12,50', '1', false)).toBe('12,50');
  });

  it('deletes a digit, or clears an amount the till put there', () => {
    expect(padInput('500', 'del', false)).toBe('50');
    expect(padInput('220', 'del', true)).toBe('');
  });

  it('drops a leading zero and caps the length', () => {
    expect(padInput('0', '7', false)).toBe('7');
    expect(padInput('1234567', '8', false)).toBe('1234567');
  });
});

describe('centsToPadText', () => {
  it('writes cents the way the pad would have typed them', () => {
    expect(centsToPadText(50_000)).toBe('500');
    expect(centsToPadText(21_950)).toBe('219,5');
    expect(centsToPadText(5)).toBe('0,05');
  });
});

describe('ukPlural', () => {
  it('follows the Ukrainian rule, teens included', () => {
    expect(positionsText(1)).toBe('1 позиція');
    expect(positionsText(3)).toBe('3 позиції');
    expect(positionsText(5)).toBe('5 позицій');
    expect(positionsText(12)).toBe('12 позицій');
    expect(positionsText(21)).toBe('21 позиція');
    expect(positionsText(22)).toBe('22 позиції');
    expect(ukPlural(111, 'a', 'b', 'c')).toBe('c');
  });
});
