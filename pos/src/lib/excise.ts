// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Excise stamps at the till (track ДК, ДК4, TechDocs/POS_DUAL_REGISTER.md
// §4.3). The same loose rule as the server's `src/pos/excise.ts` (decision
// Д9) — upper case, one space between parts, 8–40 letters, digits and spaces
// with at least one digit — so the till refuses a misread scan before the
// sale does; the server checks again and is the one that knows a stamp was
// already sold.

const LABEL_RE = /^[\p{L}\p{N} ]{8,40}$/u;

/** A stamp as the server stores it, or null when it cannot be one. */
export function normalizeExciseLabel(raw: string): string | null {
  const label = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!LABEL_RE.test(label) || !/\d/.test(label)) return null;
  return label;
}

interface StampedLine {
  quantity: number;
  excise_per_unit?: boolean;
  excise_labels?: string[];
}

/** How many stamps a line still needs; 0 for a line that needs none or has them all. */
export function stampsMissing(line: StampedLine): number {
  if (!line.excise_per_unit) return 0;
  return Math.max(0, line.quantity - (line.excise_labels?.length ?? 0));
}

/** Lines that cannot be paid yet: missing a stamp, or holding more than their bottles. */
export function linesNeedingStamps<T extends StampedLine>(lines: readonly T[]): T[] {
  return lines.filter(
    (line) => line.excise_per_unit && (line.excise_labels?.length ?? 0) !== line.quantity
  );
}
