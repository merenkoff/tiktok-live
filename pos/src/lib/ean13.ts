// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * EAN-13 → bar pattern, for printing a price tag.
 *
 * Written rather than pulled in: the encoding is three fixed tables and a
 * parity lookup, we need exactly one symbology, and a barcode library is a
 * dependency whose failure mode is an unscannable tag nobody notices until the
 * queue is out the door. `html5-qrcode`, already here, only *reads* codes.
 */

// Left group, odd parity.
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
// Left group, even parity.
const G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
// Right group. Always the complement of L.
const R = L.map((bits) => bits.replace(/[01]/g, (b) => (b === '0' ? '1' : '0')));

/**
 * The thirteenth digit is not drawn. It picks which of digits 2–7 use the even
 * parity table, and that choice is the only thing carrying it — which is how a
 * scanner recovers it and how it can tell a code read upside down.
 */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const START_GUARD = '101';
const CENTRE_GUARD = '01010';
const END_GUARD = '101';

/** Total modules in an EAN-13: 3 + 6×7 + 5 + 6×7 + 3. */
export const EAN13_MODULES = 95;

export function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code);
}

/**
 * Encode to one module per character, `'1'` = bar.
 *
 * Throws on anything that is not thirteen digits: a silently mis-drawn barcode
 * is worse than no barcode, because it looks fine on the label.
 */
export function encodeEan13(code: string): string {
  if (!isEan13(code)) throw new Error(`not an EAN-13: ${code}`);
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]!]!;

  const left = digits
    .slice(1, 7)
    .map((d, i) => (parity[i] === 'L' ? L[d]! : G[d]!))
    .join('');
  const right = digits.slice(7).map((d) => R[d]!).join('');

  return `${START_GUARD}${left}${CENTRE_GUARD}${right}${END_GUARD}`;
}

/**
 * Runs of bars, as `[startModule, widthInModules]`, so a renderer emits one
 * rect per bar instead of 95 of them.
 */
export function ean13Bars(code: string): Array<[number, number]> {
  const pattern = encodeEan13(code);
  const bars: Array<[number, number]> = [];
  let run = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      run += 1;
      continue;
    }
    if (run > 0) bars.push([i - run, run]);
    run = 0;
  }
  if (run > 0) bars.push([pattern.length - run, run]);
  return bars;
}
