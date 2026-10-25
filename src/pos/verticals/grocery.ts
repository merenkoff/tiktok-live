// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/grocery.ts — the fifth vertical: a corner grocery or a
// market stall (TechDocs/grocery/README.md; this file is G4_WEIGHED.md §6).

import type { VerticalDefinition } from './types.js';

/**
 * Groceries: most goods arrive packed and are scanned by the maker's barcode;
 * some — cheese, sausage, vegetables, sweets — are sold by weight. A weighed
 * good is a variant in `г` (or `мл`, for kvass or oil poured into the
 * customer's bottle) priced per kilogram or litre (`weighedUnits`, migration
 * 075): 350 g of cheese is quantity 350 at a price per 1000 g, and the till
 * rings it through the weight pad.
 *
 * Two attributes, both optional: `variety` tells two goods of one card apart
 * («Гауда», «Голден»), `packaging` says what a packed one holds («900 г»,
 * «1,5 л»). A weighed variant has no packaging — its weight is the line's
 * quantity, typed at the counter.
 */
export const groceryVertical: VerticalDefinition = {
  id: 'grocery',
  title: 'Продукти',
  attributes: [
    {
      key: 'variety',
      label: 'Сорт',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: 'Гауда',
    },
    {
      key: 'packaging',
      label: 'Фасування',
      type: 'text',
      inLabel: true,
      inSearch: true,
      placeholder: '900 г',
    },
  ],
  units: ['шт', 'г', 'мл'],
  // Grams and millilitres are SOLD here, by the kilogram or the litre — the
  // opposite of the café, whose grams are ingredients priced per gram.
  weighedUnits: ['г', 'мл'],
  // Why a grocery throws goods away, each its own line in the expense report.
  // `expired` comes first because it is the one a shop meets every week — the
  // yoghurt past its date — and is what the owner looks for; `spoiled` is what
  // rotted before any date (a soft tomato), `damaged` the bottle that was
  // dropped, `shrinkage` what weighed goods lose as they dry out (the cheese
  // that came in at 5 kg and is 4.85 kg a week later) — none of them «Інше»
  // with a comment, which is exactly what that report cannot add up.
  writeoffReasons: [
    { code: 'expired', label: 'Прострочено' },
    { code: 'spoiled', label: 'Зіпсувалося' },
    { code: 'damaged', label: 'Брак' },
    { code: 'shrinkage', label: 'Усушка' },
    { code: 'lost', label: 'Втрата' },
    { code: 'gift', label: 'Подарунок' },
    { code: 'other', label: 'Інше' },
  ],
  labelOf: (attrs) =>
    [attrs.variety, attrs.packaging]
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean)
      .join(' · '),
  // A case of water or a block of cigarettes is a `derived` composite of the
  // single bottles or packs on the shelf: selling the case takes six of them.
  productKinds: ['simple', 'composite'],
  // …and never a case of cases.
  maxCompositionDepth: 1,
  kitchen: false,
  // A packed good is scanned by the maker's code, which the owner types or
  // scans into the card and which is never replaced. What has none — the
  // weighed cheese, the local tomatoes — gets one of the shop's own `29…`
  // codes for its price tag, and a scanned tag opens the weight pad.
  autoBarcode: true,
};
