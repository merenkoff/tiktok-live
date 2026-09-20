// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/cafe.ts — the third vertical: a coffee shop first, a
// kitchen and tables later (TechDocs/POS_CAFE.md).

import type { VerticalDefinition } from './types.js';

/**
 * Café: a drink comes in sizes, a dish has no attributes at all, and both are
 * tech cards — `kind = 'composite'` products whose recipe is written off when
 * they sell. What makes this vertical different from flowers is the third
 * unit set and the recipe depth: an ingredient is counted in grams or
 * millilitres (200 ml of milk is quantity 200 in unit 'мл' — quantities stay
 * whole, TechDocs/POS_CAFE.md §9.3), and a dish may contain a semi-finished
 * product that is itself a recipe (a sauce, a syrup, a dough), which a
 * bouquet may not.
 */
export const cafeVertical: VerticalDefinition = {
  id: 'cafe',
  title: 'Кафе',
  attributes: [
    {
      key: 'size',
      label: 'Розмір',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: 'M · 350 мл',
    },
  ],
  units: ['шт', 'г', 'мл'],
  labelOf: (attrs) => (attrs.size == null ? '' : String(attrs.size)),
  productKinds: ['simple', 'composite'],
  // dish → semi-finished → semi-finished → ingredients. Deeper than that is a
  // modelling smell, and the cycle/depth walk on every recipe write has to
  // stop somewhere.
  maxCompositionDepth: 3,
  // A latte is made after it is paid for; the board and the ticket exist for
  // exactly that gap.
  kitchen: true,
};
