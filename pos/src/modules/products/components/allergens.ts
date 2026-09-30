// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The fourteen allergens a dish's card may name — Regulation (EU) 1169/2011,
// Annex II — and the composition line's limit. A COPY of `src/pos/allergens.ts`:
// the two apps cannot import each other, so `pos.public-menu.dishfacts.test.ts`
// on the backend compares this file with the server's list. Pure on purpose (no
// imports) so that test can read it.

export interface Allergen {
  code: string;
  label: string;
}

/** In the order a guest reads them; also the canonical order of a chosen set. */
export const ALLERGENS: readonly Allergen[] = [
  { code: 'gluten', label: 'Глютен' },
  { code: 'crustaceans', label: 'Ракоподібні' },
  { code: 'eggs', label: 'Яйця' },
  { code: 'fish', label: 'Риба' },
  { code: 'peanuts', label: 'Арахіс' },
  { code: 'soy', label: 'Соя' },
  { code: 'milk', label: 'Молоко' },
  { code: 'nuts', label: 'Горіхи' },
  { code: 'celery', label: 'Селера' },
  { code: 'mustard', label: 'Гірчиця' },
  { code: 'sesame', label: 'Кунжут' },
  { code: 'sulphites', label: 'Сульфіти' },
  { code: 'lupin', label: 'Люпин' },
  { code: 'molluscs', label: 'Молюски' },
];

export const COMPOSITION_MAX = 400;
