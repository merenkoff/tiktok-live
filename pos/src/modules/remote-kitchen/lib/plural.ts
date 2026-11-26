// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Ukrainian plural, the host's `lib/plural.ts` rule: a remote module keeps its
// own copy rather than reaching into the host (the `tables` module does the
// same), and the platform exports none.

/** 1 замовлення, 2–4 замовлення, 5–20 замовлень, 21 замовлення, 22 замовлення… */
export function ukPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const tens = abs % 100;
  const units = abs % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** «5 замовлень», «22 замовлення». */
export function ordersText(n: number): string {
  return `${n} ${ukPlural(n, 'замовлення', 'замовлення', 'замовлень')}`;
}
