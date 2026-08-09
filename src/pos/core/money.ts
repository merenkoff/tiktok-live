// src/pos/core/money.ts

export function formatUah(cents: number): string {
  const value = (cents / 100).toFixed(2);
  return `${value.replace('.', ',')} ₴`;
}

export function uahToCents(uah: number): number {
  return Math.round(uah * 100);
}
