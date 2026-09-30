// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { parseChildQuery, rungFor, suggestSizes, type ChildQuery } from './sizeFinder';

describe('parseChildQuery', () => {
  const age = (months: number): ChildQuery => ({ kind: 'age', months });
  const height = (cm: number): ChildQuery => ({ kind: 'height', cm });

  it.each<[string, ChildQuery | null]>([
    // an age in years, however the cashier writes it
    ['2 роки', age(24)],
    ['2р', age(24)],
    ['2 р.', age(24)],
    ['3 роки', age(36)],
    ['5 років', age(60)],
    ['1 рік', age(12)],
    ['1,5 року', age(18)],
    ['1.5 року', age(18)],
    ['півтора року', age(18)],
    ['півтора', age(18)],
    ['2 years', age(24)],
    // an age in months
    ['18 міс', age(18)],
    ['6 місяців', age(6)],
    ['9 міс.', age(9)],
    ['3м', age(3)],
    ['півроку', age(6)],
    // a height
    ['98 см', height(98)],
    ['98см', height(98)],
    ['104 cm', height(104)],
    // a bare number is a height from 50 to 170 and an age in years up to 14
    ['98', height(98)],
    ['104', height(104)],
    ['3', age(36)],
    ['1,5', age(18)],
    ['0', age(0)],
    ['  2   РОКИ ', age(24)],
    // neither
    ['Дитині 2 роки', null],
    ['', null],
    ['   ', null],
    ['привіт', null],
    ['20', null],
    ['15', null],
    ['400', null],
    ['-3', null],
    ['20 р', null],
    ['200 см', null],
  ])('reads «%s»', (text, expected) => {
    expect(parseChildQuery(text)).toEqual(expected);
  });
});

describe('rungFor', () => {
  it('points an age at the size a child of that age wears', () => {
    expect(rungFor({ kind: 'age', months: 2 })?.cm).toBe(62);
    expect(rungFor({ kind: 'age', months: 24 })?.cm).toBe(98);
    expect(rungFor({ kind: 'age', months: 36 })?.cm).toBe(104);
    expect(rungFor({ kind: 'age', months: 18 })?.cm).toBe(92);
  });

  it('points a height at the first size that is not smaller: 95 cm wears 98', () => {
    expect(rungFor({ kind: 'height', cm: 95 })?.cm).toBe(98);
    expect(rungFor({ kind: 'height', cm: 98 })?.cm).toBe(98);
    expect(rungFor({ kind: 'height', cm: 99 })?.cm).toBe(104);
    expect(rungFor({ kind: 'height', cm: 50 })?.cm).toBe(56);
    expect(rungFor({ kind: 'height', cm: 164 })?.cm).toBe(164);
    expect(rungFor({ kind: 'height', cm: 170 })).toBeNull();
  });
});

describe('suggestSizes', () => {
  // A shop that writes sizes every way at once.
  const labels = ['62', '68', '74', '80', '86', '92', '98', '104', '110', '3–6 міс', '2–3 роки', '3–4 роки', '98-104', 'XL', '36'];

  it('lights every label that covers the size, however it is written', () => {
    const s = suggestSizes({ kind: 'age', months: 24 }, labels)!;
    expect(s.rung.cm).toBe(98);
    expect(s.fit).toEqual(['98', '2–3 роки', '98-104']);
  });

  it('keeps the next size up as «на виріст», and never a size it already fits', () => {
    const s = suggestSizes({ kind: 'age', months: 24 }, labels)!;
    expect(s.room).toEqual(['104', '3–4 роки']);
  });

  it('follows a height, not just an age', () => {
    const s = suggestSizes({ kind: 'height', cm: 95 }, labels)!;
    expect(s.fit).toEqual(['98', '2–3 роки', '98-104']);
  });

  it('points at 104 for a three-year-old, and at 110 for growth', () => {
    const s = suggestSizes({ kind: 'age', months: 36 }, labels)!;
    expect(s.fit).toEqual(['104', '3–4 роки', '98-104']);
    expect(s.room).toEqual(['110']);
  });

  it('never suggests a letter size or a shoe — they are not on the ladder', () => {
    const s = suggestSizes({ kind: 'age', months: 24 }, ['XL', 'M', '36', '26'])!;
    expect(s.fit).toEqual([]);
    expect(s.room).toEqual([]);
  });

  it('says nothing for a size past the ladder', () => {
    expect(suggestSizes({ kind: 'height', cm: 170 }, labels)).toBeNull();
  });

  it('finds no room above the largest size', () => {
    const s = suggestSizes({ kind: 'height', cm: 164 }, ['164', '158'])!;
    expect(s.fit).toEqual(['164']);
    expect(s.room).toEqual([]);
  });
});
