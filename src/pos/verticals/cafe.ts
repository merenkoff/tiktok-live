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
  // A kitchen throws food away for reasons a boutique has no word for, and
  // each one is its own line in the expense report — which is precisely why
  // they are not «Інше» with a comment. `spoiled` is what the shop bought and
  // failed to sell in time (milk past its date); `damaged` stays for the
  // bottle that was dropped. `tasting` is what the barista poured to calibrate
  // the grinder, `staff` what the team ate — both are costs the owner wants to
  // see apart from waste, because one is training and the other is a benefit.
  writeoffReasons: [
    { code: 'spoiled', label: 'Зіпсувалося' },
    { code: 'damaged', label: 'Брак' },
    { code: 'tasting', label: 'Проба' },
    { code: 'staff', label: 'Харчування персоналу' },
    { code: 'gift', label: 'Подарунок' },
    { code: 'lost', label: 'Втрата' },
    { code: 'other', label: 'Інше' },
  ],
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
