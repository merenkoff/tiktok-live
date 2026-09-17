// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { VerticalId, VerticalPublicConfig } from '../types';

/**
 * What a till assumes when nothing tells it otherwise: an `AuthResponse` cached
 * by a build older than verticals, or a session rebuilt cold-offline from such
 * a row. Clothing is what every store was before the column existed, and its
 * catalog is the bundled fallback the sell screen falls back to anyway.
 *
 * Kept byte-identical to `publicConfigOf(clothingVertical)` on the server by
 * `vertical.test.ts`, which imports both.
 */
export const DEFAULT_VERTICAL: VerticalPublicConfig = {
  id: 'clothing',
  title: 'Одяг',
  attributes: [
    { key: 'color', label: 'Колір', type: 'text', inLabel: true, inSearch: true, placeholder: 'Колір' },
    { key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true, placeholder: 'Розмір' },
  ],
  units: ['шт'],
  defaultUnit: 'шт',
};

/**
 * Verticals this build can offer in the super admin's picker, mirroring
 * `BUILT_IN` in `src/pos/verticals/index.ts`. Titles only — the full schema of
 * whichever one a store is on arrives with its login.
 *
 * `vertical.test.ts` pins this list against the backend registry, the same way
 * `modules/constants.test.ts` pins the module ids.
 */
export const VERTICAL_OPTIONS: ReadonlyArray<{ id: VerticalId; title: string }> = [
  { id: 'clothing', title: 'Одяг' },
  { id: 'flowers', title: 'Квіти' },
];

/** Title for a vertical id, falling back to the raw id for an unknown one. */
export function verticalTitle(id: string): string {
  return VERTICAL_OPTIONS.find((v) => v.id === id)?.title ?? id;
}
