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
