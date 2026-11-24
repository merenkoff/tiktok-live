// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A recipe's «вихід» (migration 116) in the words a kitchen uses: 1900 г is
 * «1,9 кг», 2500 мл «2,5 л», 40 шт «40 шт».
 */
export function batchText(amount: number, unit: string): string {
  const big = unit === 'г' ? 'кг' : unit === 'мл' ? 'л' : null;
  if (big && amount >= 1000) {
    return `${(amount / 1000).toLocaleString('uk-UA', { maximumFractionDigits: 3 })} ${big}`;
  }
  return `${amount.toLocaleString('uk-UA')} ${unit}`;
}
