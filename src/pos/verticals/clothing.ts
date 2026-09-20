// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/clothing.ts — the vertical every store had before verticals
// existed, and the one the bundled sell screen falls back to.

import type { VerticalDefinition } from './types.js';

/**
 * Clothing: colour + size, sold by the piece.
 *
 * `labelOf` reproduces the old `sales.service.ts` composer byte for byte —
 * `[color, size].filter(Boolean).join(' / ')`. Migration 035 backfills existing
 * rows with exactly this string, so no shop's labels change when the model does.
 */
export const clothingVertical: VerticalDefinition = {
  id: 'clothing',
  title: 'Одяг',
  attributes: [
    {
      key: 'color',
      label: 'Колір',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: 'Колір',
    },
    {
      key: 'size',
      label: 'Розмір',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: 'Розмір',
    },
  ],
  units: ['шт'],
  labelOf: (attrs) =>
    [attrs.color, attrs.size]
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean)
      .join(' / '),
  productKinds: ['simple'],
  maxCompositionDepth: 1,
  kitchen: false,
};
