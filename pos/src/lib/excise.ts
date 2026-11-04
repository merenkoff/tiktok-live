// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Excise stamps at the till (track ДК, ДК4, TechDocs/POS_DUAL_REGISTER.md
// §4.3). A copy of the server's rule in `src/pos/excise.ts` (decision Д9) —
// upper case, one space between parts, 8–40 Latin letters, digits and spaces
// with at least one digit — so the till refuses a misread scan before the
// sale does; the server checks again and is the one that knows a stamp was
// already sold. Both test files carry the same cases.
//
// A wedge scanner presses the KEYS a stamp's Latin letters sit on, so under
// a Ukrainian or Russian keyboard layout «ANFC015604» arrives as «ФТАС015604»
// (the real scans of 2026-11-04, `TechDocs/POS_DUAL_REGISTER.md` §7.11). The
// till's own scan detector already reads keys by position (`scannedChar`), so
// this catches what reaches us another way — a stamp typed or pasted under
// that layout, a tablet's Bluetooth scanner, another client. The series of a
// paper stamp is Latin, so a Cyrillic letter is read back as the Latin letter
// on the same key; one with no letter on its key (Х, Ж, Є…) leaves the scan
// unreadable. And a cashier scanning the bottle's own
// barcode instead of its stamp is told so rather than selling the EAN-13.

const LAYOUT: Record<string, string> = {
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P',
  Ф: 'A', І: 'S', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J', Л: 'K', Д: 'L',
  Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M',
};

const LABEL_RE = /^[A-Z0-9 ]{8,40}$/;

function latin(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/[\u0400-\u04FF]/g, (c) => LAYOUT[c] ?? c);
}

/** GS1 check digit, as a goods barcode carries it. */
function gs1CheckDigitOk(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(digits[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** True when what was scanned is a goods barcode (EAN-8/UPC/EAN-13/GTIN-14), not a stamp. */
export function isGoodsBarcode(raw: string): boolean {
  const digits = raw.replace(/\s+/g, '');
  return /^(\d{8}|\d{12,14})$/.test(digits) && gs1CheckDigitOk(digits);
}

/** A stamp as the server stores it, or null when it cannot be one. */
export function normalizeExciseLabel(raw: string): string | null {
  const label = latin(raw);
  if (!LABEL_RE.test(label) || !/\d/.test(label) || isGoodsBarcode(label)) return null;
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
