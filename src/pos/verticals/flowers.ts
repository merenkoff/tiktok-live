// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/flowers.ts — the first vertical whose sell screen ships as
// an online-only module (`vertical-flowers`).

import type { VerticalDefinition } from './types.js';

/**
 * Flowers: a stem has a colour, a length and an origin, and is sold by the
 * piece. Bouquets — a product assembled from stems and consumables whose
 * components are written off when it sells — are a later phase and need
 * `pos_products.kind = 'composite'`, not a change here.
 */
export const flowersVertical: VerticalDefinition = {
  id: 'flowers',
  title: 'Квіти',
  attributes: [
    {
      key: 'length_cm',
      label: 'Довжина',
      type: 'number',
      unitSuffix: 'см',
      inLabel: true,
      placeholder: '60',
    },
    {
      key: 'color',
      label: 'Колір',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: 'Червона',
    },
    {
      key: 'country',
      label: 'Країна',
      type: 'text',
      inSearch: true,
      placeholder: 'Еквадор',
    },
  ],
  units: ['шт'],
  labelOf: (attrs) =>
    [
      attrs.color == null ? '' : String(attrs.color),
      attrs.length_cm == null ? '' : `${attrs.length_cm} см`,
    ]
      .filter(Boolean)
      .join(' · '),
  productKinds: ['simple'],
};
