// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of the size ladder (TechDocs/POS_CLOTHING.md, phase C1d). LADDER_CASES
// is the table `src/__tests__/pos.size-ladder.test.ts` pins on the server, copied verbatim:
// the offline till reads a size with its own code and must never read it differently.

import { describe, expect, it } from 'vitest';
import {
  formatAgeRange,
  monthsLabel,
  parseSize,
  rungByCm,
  rungForMonths,
  rungUpTo,
  SIZE_LADDER,
  sizeHint,
  yearsLabel,
  type SizeKind,
} from './sizeLadder';

/**
 * ONE table of cases for the ladder, copied verbatim into `pos/src/lib/sizeLadder.test.ts`:
 * the till reads a size with its own copy of the code and must never read it differently.
 */
const LADDER_CASES: Array<{ label: string; parsed: [SizeKind, number, number] | null; hint: string | null }> = [
  // A height, single and paired: the hint is the age it fits.
  { label: '56', parsed: ['height', 56, 56], hint: '0–1 міс' },
  { label: '62', parsed: ['height', 62, 62], hint: '1–3 міс' },
  { label: '86', parsed: ['height', 86, 86], hint: '12–18 міс' },
  { label: '92', parsed: ['height', 92, 92], hint: '18–24 міс' },
  { label: '98', parsed: ['height', 98, 98], hint: '2–3 роки' },
  { label: '104', parsed: ['height', 104, 104], hint: '3–4 роки' },
  { label: '116', parsed: ['height', 116, 116], hint: '5–6 років' },
  { label: '164', parsed: ['height', 164, 164], hint: '13–14 років' },
  { label: '92 см', parsed: ['height', 92, 92], hint: '18–24 міс' },
  { label: '98-104', parsed: ['height', 98, 104], hint: '2–4 роки' },
  { label: '98/104', parsed: ['height', 98, 104], hint: '2–4 роки' },
  { label: '98–104', parsed: ['height', 98, 104], hint: '2–4 роки' },
  { label: '86-92', parsed: ['height', 86, 92], hint: '12–24 міс' },
  { label: '56-62', parsed: ['height', 56, 62], hint: '0–3 міс' },
  // A height off the ladder (a belt, an odd size) is still a height to order by, and has no hint.
  { label: '100', parsed: ['height', 100, 100], hint: null },
  { label: '57', parsed: ['height', 57, 57], hint: null },
  // An age in months: the hint is the height it is named after.
  { label: '0–3 міс', parsed: ['months', 56, 62], hint: '≈ 56–62 см' },
  { label: '3–6 міс', parsed: ['months', 68, 68], hint: '≈ 68 см' },
  { label: '3-6 міс.', parsed: ['months', 68, 68], hint: '≈ 68 см' },
  { label: '6–9 міс', parsed: ['months', 74, 74], hint: '≈ 74 см' },
  { label: '9–12 міс', parsed: ['months', 80, 80], hint: '≈ 80 см' },
  { label: '12–18 міс', parsed: ['months', 86, 86], hint: '≈ 86 см' },
  { label: '18–24 міс', parsed: ['months', 92, 92], hint: '≈ 92 см' },
  // An age in years.
  { label: '1–2 роки', parsed: ['years', 86, 92], hint: '≈ 86–92 см' },
  { label: '2–3 роки', parsed: ['years', 98, 98], hint: '≈ 98 см' },
  { label: '3–4 роки', parsed: ['years', 104, 104], hint: '≈ 104 см' },
  { label: '4-5 років', parsed: ['years', 110, 110], hint: '≈ 110 см' },
  { label: '2–4 роки', parsed: ['years', 98, 104], hint: '≈ 98–104 см' },
  { label: '13–14 років', parsed: ['years', 164, 164], hint: '≈ 164 см' },
  // NOT sizes this reads: a bare number is an age, a height, a shoe or a count — guessing is how a size ends up wrong.
  { label: '4', parsed: null, hint: null },
  { label: '2', parsed: null, hint: null },
  { label: '3-6', parsed: null, hint: null },
  { label: '12-18', parsed: null, hint: null },
  { label: '4 роки', parsed: null, hint: null },
  { label: '5 р.', parsed: null, hint: null },
  { label: 'XL', parsed: null, hint: null },
  { label: 'Універсальний', parsed: null, hint: null },
  { label: '36–40', parsed: null, hint: null },
  { label: '26', parsed: null, hint: null },
  { label: '', parsed: null, hint: null },
  // Past the ladder, or backwards: nothing rather than a wrong rung.
  { label: '14–15 років', parsed: null, hint: null },
  { label: '4–3 роки', parsed: null, hint: null },
  { label: '6–3 міс', parsed: null, hint: null },
  { label: '104-98', parsed: null, hint: null },
  { label: '98-98', parsed: null, hint: null },
  { label: '40', parsed: null, hint: null },
  { label: '180', parsed: null, hint: null },
];

describe('the ladder itself', () => {
  it('runs from a newborn to 164 cm with no gap in age and six centimetres a step', () => {
    expect(SIZE_LADDER).toHaveLength(19);
    expect(SIZE_LADDER[0]).toEqual({ cm: 56, from: 0, to: 1 });
    expect(SIZE_LADDER.at(-1)).toEqual({ cm: 164, from: 156, to: 168 });
    for (let i = 1; i < SIZE_LADDER.length; i++) {
      expect(SIZE_LADDER[i]!.from).toBe(SIZE_LADDER[i - 1]!.to);
      expect(SIZE_LADDER[i]!.cm - SIZE_LADDER[i - 1]!.cm).toBe(6);
    }
  });

  it('agrees with the charts the shop reads: 62 is 1–3 months, 86 is 12–18, 98 is 2–3 years', () => {
    expect(rungByCm(62)).toMatchObject({ from: 1, to: 3 });
    expect(rungByCm(86)).toMatchObject({ from: 12, to: 18 });
    expect(rungByCm(98)).toMatchObject({ from: 24, to: 36 });
    expect(rungByCm(99)).toBeNull();
  });

  it('finds the size a child of so many months wears', () => {
    expect(rungForMonths(0)?.cm).toBe(56);
    expect(rungForMonths(1)?.cm).toBe(62);
    expect(rungForMonths(2)?.cm).toBe(62);
    expect(rungForMonths(3)?.cm).toBe(68);
    expect(rungForMonths(36)?.cm).toBe(104);
    expect(rungForMonths(167)?.cm).toBe(164);
    // Older than the ladder: the last size, not nothing.
    expect(rungForMonths(400)?.cm).toBe(164);
    expect(rungForMonths(-1)).toBeNull();
  });

  it('finds the size an «up to N months» label is named after', () => {
    expect(rungUpTo(1)?.cm).toBe(56);
    expect(rungUpTo(3)?.cm).toBe(62);
    expect(rungUpTo(6)?.cm).toBe(68);
    expect(rungUpTo(24)?.cm).toBe(92);
    expect(rungUpTo(168)?.cm).toBe(164);
    expect(rungUpTo(169)).toBeNull();
  });
});

describe('parseSize and sizeHint', () => {
  it.each(LADDER_CASES)('reads «$label»', ({ label, parsed, hint }) => {
    const got = parseSize(label);
    expect(got ? [got.kind, got.low, got.high] : null).toEqual(parsed);
    expect(sizeHint(label)).toBe(hint);
  });
});

describe('writing an age', () => {
  it('words a range in months and in years, the word agreeing with the last number', () => {
    expect(monthsLabel(3, 6)).toBe('3–6 міс');
    expect(yearsLabel(1, 2)).toBe('1–2 роки');
    expect(yearsLabel(2, 3)).toBe('2–3 роки');
    expect(yearsLabel(3, 4)).toBe('3–4 роки');
    expect(yearsLabel(4, 5)).toBe('4–5 років');
    expect(yearsLabel(10, 11)).toBe('10–11 років');
    expect(yearsLabel(11, 12)).toBe('11–12 років');
    expect(yearsLabel(13, 14)).toBe('13–14 років');
  });

  it('words an age range from the ladder: months while it ends by two years, years after', () => {
    expect(formatAgeRange(0, 3)).toBe('0–3 міс');
    expect(formatAgeRange(12, 24)).toBe('12–24 міс');
    expect(formatAgeRange(24, 36)).toBe('2–3 роки');
    expect(formatAgeRange(24, 48)).toBe('2–4 роки');
    expect(formatAgeRange(18, 48)).toBe('18 міс–4 роки');
  });

  it('writes labels it can read back: every label a scale offers parses, onto the rung it names', () => {
    for (const [from, to] of [[0, 3], [3, 6], [6, 9], [9, 12], [12, 18], [18, 24]] as const) {
      expect(parseSize(monthsLabel(from, to))?.kind).toBe('months');
    }
    for (let y = 1; y <= 13; y++) {
      const parsed = parseSize(yearsLabel(y, y + 1));
      expect(parsed?.kind).toBe('years');
      expect(parsed!.high).toBe(rungUpTo((y + 1) * 12)!.cm);
    }
  });
});
