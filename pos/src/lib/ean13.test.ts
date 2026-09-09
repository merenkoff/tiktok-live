// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { EAN13_MODULES, ean13Bars, encodeEan13, isEan13 } from './ean13';

// The tables are only trustworthy if something reads them back. This decoder
// exists solely for the tests: it inverts the encoder, so a typo in any of the
// thirty entries shows up as a round-trip failure rather than as an
// unscannable label discovered at the till.
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const R = L.map((b) => b.replace(/[01]/g, (c) => (c === '0' ? '1' : '0')));
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

function decodeEan13(pattern: string): string {
  expect(pattern.slice(0, 3)).toBe('101');
  expect(pattern.slice(45, 50)).toBe('01010');
  expect(pattern.slice(92)).toBe('101');

  const parity: string[] = [];
  const left: number[] = [];
  for (let i = 0; i < 6; i++) {
    const chunk = pattern.slice(3 + i * 7, 10 + i * 7);
    const asL = L.indexOf(chunk);
    if (asL >= 0) {
      left.push(asL);
      parity.push('L');
    } else {
      const asG = G.indexOf(chunk);
      expect(asG).toBeGreaterThanOrEqual(0);
      left.push(asG);
      parity.push('G');
    }
  }
  const first = PARITY.indexOf(parity.join(''));
  expect(first).toBeGreaterThanOrEqual(0);

  const right: number[] = [];
  for (let i = 0; i < 6; i++) {
    const chunk = pattern.slice(50 + i * 7, 57 + i * 7);
    const d = R.indexOf(chunk);
    expect(d).toBeGreaterThanOrEqual(0);
    right.push(d);
  }
  return [first, ...left, ...right].join('');
}

describe('encodeEan13', () => {
  it('lays out 95 modules with the guards where a scanner looks for them', () => {
    const p = encodeEan13('4820270362877');
    expect(p).toHaveLength(EAN13_MODULES);
    expect(p.startsWith('101')).toBe(true);
    expect(p.slice(45, 50)).toBe('01010');
    expect(p.endsWith('101')).toBe(true);
  });

  it('round-trips every code it draws', () => {
    const codes = [
      '4820270362877',
      '2900000000018',
      '5901234123457',
      '0000000000000',
      '9999999999994',
      // One per first digit: each picks a different parity pattern, so this is
      // what actually exercises the G table.
      ...Array.from({ length: 10 }, (_, d) => `${d}901234123457`),
    ];
    for (const code of codes) {
      expect(decodeEan13(encodeEan13(code))).toBe(code);
    }
  });

  it('encodes the first digit only through parity, never as bars', () => {
    // Two codes differing solely in the first digit must differ — that is the
    // whole trick of EAN-13 — but only inside the left half.
    const a = encodeEan13('0901234123457');
    const b = encodeEan13('1901234123457');
    expect(a).not.toBe(b);
    expect(a.slice(45)).toBe(b.slice(45));
  });

  it('refuses anything that is not thirteen digits', () => {
    // A silently mis-drawn barcode looks perfectly fine on the label.
    expect(() => encodeEan13('482027036287')).toThrow(/not an EAN-13/);
    expect(() => encodeEan13('48202703628770')).toThrow();
    expect(() => encodeEan13('482027O362877')).toThrow();
    expect(() => encodeEan13('')).toThrow();
  });
});

describe('ean13Bars', () => {
  it('collapses the pattern into bar runs without losing a module', () => {
    const code = '4820270362877';
    const bars = ean13Bars(code);
    const pattern = encodeEan13(code);

    const painted = Array<string>(EAN13_MODULES).fill('0');
    for (const [start, width] of bars) {
      for (let i = 0; i < width; i++) painted[start + i] = '1';
    }
    expect(painted.join('')).toBe(pattern);
  });

  it('starts and ends on a bar, as the guards require', () => {
    const bars = ean13Bars('4820270362877');
    expect(bars[0]).toEqual([0, 1]);
    expect(bars[bars.length - 1]).toEqual([94, 1]);
  });
});

describe('isEan13', () => {
  it('accepts thirteen digits and nothing else', () => {
    expect(isEan13('4820270362877')).toBe(true);
    expect(isEan13('482027036287')).toBe(false);
    expect(isEan13(' 4820270362877')).toBe(false);
  });
});
