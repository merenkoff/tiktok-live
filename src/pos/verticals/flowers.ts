// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/flowers.ts — the first vertical whose sell screen ships as
// an online-only module (`vertical-flowers`).

import { GENERIC_WRITEOFF_REASONS } from './types.js';
import type { VerticalDefinition } from './types.js';

/**
 * Flowers: a stem has a colour, a length and an origin, and is sold by the
 * piece. A bouquet is the same shop's `kind = 'composite'` product — assembled
 * from stems and consumables, either in advance or when it sells — which is
 * why this vertical allows both kinds.
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
  // A stem is a piece. The consumables a florist also sells and writes off
  // are not: ribbon goes by the centimetre, Hi-Float by the millilitre and
  // helium by the litre — whole numbers in the small unit, the café's «grams,
  // never fractional kilograms» rule (TechDocs/POS_VERTICALS.md §4; the owner's
  // decision of 2026-10-26, with the two Довідка articles on helium and
  // packaging). None of them is weighed: `weighedUnits` stays empty, so a
  // litre of helium is priced per litre and its quantity is litres. The ДПС
  // check (`fiscal/dps/units.ts`) knows «мл» and «л» and sends no unit code
  // for «см» — a code from ДК 011-96 is added there once it is verified.
  units: ['шт', 'см', 'мл', 'л'],
  // A stem is counted, never weighed — and so are the consumables above.
  weighedUnits: [],
  // A wilted rose is «Брак» here: the shop throws away the thing it bought,
  // not an ingredient it prepared. The café's three extra codes would be
  // noise on a florist's screen — and the bench's own «Вітрина» write-off is
  // narrower still (`damaged` / `gift` only), by its own list.
  writeoffReasons: GENERIC_WRITEOFF_REASONS,
  labelOf: (attrs) =>
    [
      attrs.color == null ? '' : String(attrs.color),
      attrs.length_cm == null ? '' : `${attrs.length_cm} см`,
    ]
      .filter(Boolean)
      .join(' · '),
  productKinds: ['simple', 'composite'],
  // A bouquet holds stems and consumables, never another bouquet: a bouquet
  // inside a bouquet would be priced at its card price plus labour on top of
  // labour (`priceOfComposition`), and no florist asked for it.
  maxCompositionDepth: 1,
  kitchen: false,
  autoBarcode: false,
};
