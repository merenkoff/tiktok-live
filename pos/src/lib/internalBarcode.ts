// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Recognising a store-local barcode on the client.
 *
 * Mirrors `isInternalBarcode` in `src/pos/gtin/internal-code.ts`, but only the
 * predicate: whether a code is *ours*. Whether it is a valid EAN-13 at all is
 * `isEan13` in `ean13.ts` — a separate question, asked on a different path
 * (anything printed on a tag, whoever issued it).
 *
 * Used to suppress the external lookup: a code we invented is in no public
 * database, so fanning out to Open*Facts for it would spend a provider's
 * goodwill on a guaranteed miss.
 */

export const INTERNAL_BARCODE_PREFIX = '29';

const INTERNAL_BARCODE_RE = new RegExp(`^${INTERNAL_BARCODE_PREFIX}\\d{11}$`);

export function isInternalBarcode(code: string | null | undefined): boolean {
  if (!code) return false;
  // Matched against the scanned/display form. The 14-digit canonical key is a
  // server-side concept; nothing on the client holds one.
  return INTERNAL_BARCODE_RE.test(code.trim());
}
