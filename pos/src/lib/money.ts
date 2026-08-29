// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export function formatUah(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  return `${value} ₴`;
}

export function uahInputToCents(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}
