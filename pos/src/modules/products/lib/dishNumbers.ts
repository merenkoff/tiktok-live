// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The three numbers of a dish's facts line (F14, migration 087) as the
// product card types them: text in the draft, so a value is typed digit by
// digit like a price, and the server's own words back when it refuses one.
// The strength is stored in TENTHS of a percent (45 = 4,5 %); the form shows
// and takes the percent («4,5»), and the server reads that text itself
// (`normalizeStrengthTenths` with `percent`), so no arithmetic lives here —
// the card sends what was typed and the server decides.

/** «45» tenths → «4,5» for the input; null → ''. */
export function tenthsToInput(tenths: number | null | undefined): string {
  if (tenths == null || !Number.isFinite(tenths)) return '';
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return `${whole}${frac ? `,${frac}` : ''}`;
}

/** A stored whole number → the input's text; null → ''. */
export function countToInput(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value);
}

/**
 * What the card sends for a typed number: null for an emptied box (clear),
 * the trimmed text otherwise — the server parses it and answers a bad one
 * with a sentence, which the card shows as is.
 */
export function numberInputToWire(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** The form sends the strength as a percent; the server reads it as such. */
export function strengthInputToWire(text: string): string | null {
  return numberInputToWire(text);
}
