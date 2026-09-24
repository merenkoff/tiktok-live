// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/** Ukrainian plural: 1 позиція, 2–4 позиції, 5–20 позицій, 21 позиція, 22 позиції… */
export function ukPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const tens = abs % 100;
  const units = abs % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** «3 позиції». */
export function positionsText(n: number): string {
  return `${n} ${ukPlural(n, 'позиція', 'позиції', 'позицій')}`;
}
