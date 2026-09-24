// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cash screen's arithmetic: what the customer is likely to hand over, and
// what typing on the till's number pad does to the amount received.

/**
 * The quick amounts under «Отримано»: the exact total first, then the three
 * nearest sums a customer pays a bill with. Round hundreds, then a 500 and a
 * 1000 note, then whatever else it takes to have three — for 220 ₴ that is
 * 300, 500, 1000; for 950 ₴, 1000, 2000, 5000.
 */
export function quickCashAmounts(totalCents: number): number[] {
  const total = Math.max(0, totalCents);
  const steps = [10_000, 50_000, 100_000, 20_000, 5_000, 200_000, 500_000];
  const above = new Set<number>();
  for (const step of steps) {
    if (above.size >= 3) break;
    const v = Math.ceil(total / step) * step;
    if (v > total) above.add(v);
  }
  return [total, ...[...above].sort((a, b) => a - b).slice(0, 3)];
}

/** Cents as the pad shows them: «500», «219,5», «0,05» — never a trailing «,00». */
export function centsToPadText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  if (frac === 0) return String(whole);
  return `${whole},${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'del';

/**
 * One tap on the pad. `fresh` means the amount on screen was put there by the
 * till (the exact total, a quick amount) rather than typed: the first digit
 * replaces it, as on a calculator, because nobody types 500 on the end of 220.
 * At most two digits after the comma, at most seven before it.
 */
export function padInput(text: string, key: PadKey, fresh: boolean): string {
  const base = fresh ? '' : text;
  if (key === 'del') return fresh ? '' : base.slice(0, -1);
  if (key === ',') {
    if (base.includes(',')) return base;
    return `${base || '0'},`;
  }
  const [whole, frac] = base.split(',');
  if (frac !== undefined) return frac.length >= 2 ? base : base + key;
  if (whole === '0') return key;
  if (whole.length >= 7) return base;
  return base + key;
}
