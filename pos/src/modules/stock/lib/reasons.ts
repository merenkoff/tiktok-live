// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Why stock leaves without being sold (К5e). The **write-off** vocabulary
// belongs to the store's vertical and arrives with the login; the
// **correction** one does not.

import type { VerticalPublicConfig, WriteoffReason } from '@pos/platform';

/**
 * What to show when the session carries no list.
 *
 * That happens on an auth cached by a build older than К5e, or rebuilt
 * cold-offline from such a row — the same case `maxCompositionDepth` has. A
 * screen with no reason buttons cannot write anything off, so the four a shop
 * has always had are the floor. The server still decides: it refuses a code
 * outside its own vertical's list, whatever this offers.
 */
const FALLBACK: readonly WriteoffReason[] = [
  { code: 'damaged', label: 'Брак' },
  { code: 'lost', label: 'Втрата' },
  { code: 'gift', label: 'Подарунок' },
  { code: 'other', label: 'Інше' },
];

/**
 * Why a correction was made — about **counting**, not about what happened to
 * the goods, so it is the same in every shop and is deliberately NOT on the
 * vertical. `createDocument` does not check these against one either.
 */
export const ADJUST_REASONS: readonly WriteoffReason[] = [
  { code: 'found', label: 'Знайшли' },
  { code: 'loss', label: 'Не вистачає' },
  { code: 'data_fix', label: 'Помилка введення' },
  { code: 'other', label: 'Інше' },
];

/** The store's write-off reasons, in its vertical's order. Never empty. */
export function writeoffReasonsOf(vertical: VerticalPublicConfig): readonly WriteoffReason[] {
  const own = vertical.writeoffReasons;
  return own && own.length > 0 ? own : FALLBACK;
}

/**
 * Which reason a screen opens on: the first of the list, because a vertical
 * orders its reasons by how often they are used — «Зіпсувалося» for a kitchen,
 * «Брак» for a shop. Corrections open on «Помилка введення», which is what a
 * correction usually is.
 */
export function defaultReason(reasons: readonly WriteoffReason[]): string {
  return reasons[0]?.code ?? 'other';
}
