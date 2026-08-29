// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/money.ts

export function formatUah(cents: number): string {
  const value = (cents / 100).toFixed(2);
  return `${value.replace('.', ',')} ₴`;
}

export function uahToCents(uah: number): number {
  return Math.round(uah * 100);
}
