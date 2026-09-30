// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/allergens.ts — what a dish's card may say about what is in it
// (migration 060, TechDocs/POS_QR_MENU.md phase Q3b).
//
// Two things, both written by the owner and both optional: a line of
// COMPOSITION («Еспресо, молоко») and a set of ALLERGENS ticked from the
// fixed list of fourteen that Regulation (EU) 1169/2011 Annex II names. The
// composition is NOT derived from the recipe: a recipe lists stock (cups, lids,
// a syrup «порція»), leaves out what a modifier adds (the milk of a latte is an
// answer to «Молоко?», not part of the recipe), and is exactly the thing the
// guest's page must never show.
//
// An empty set means «the owner has not said», never «there are none»: the page
// prints allergens only when some are ticked, and there is deliberately no way
// to claim a dish is free of them.
//
// The client keeps a copy of this list (`pos/src/modules/products/lib/
// allergens.ts`) because `rootDir` keeps the two apps from importing each
// other; a test compares them.

import { oneLine } from './core/text.js';

export interface Allergen {
  code: string;
  label: string;
}

/** In the order a guest reads them; the canonical order of a stored set as well. */
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

const LABELS = new Map(ALLERGENS.map((a) => [a.code, a.label]));

export const COMPOSITION_MAX = 400;

/** Thrown for a value the owner can fix; the routes answer it with a 400 and the message as is. */
export class AllergenError extends Error {}

/**
 * The set an owner sent, checked and put in canonical order without repeats.
 * A code that is not on the list is refused (a typo must not become a
 * «allergen» a guest never sees), `null` reads as the empty set.
 */
export function normalizeAllergens(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new AllergenError('Алергени: очікується список');
  const chosen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' || !LABELS.has(value)) {
      throw new AllergenError(`Алергени: невідомий код «${String(value)}»`);
    }
    chosen.add(value);
  }
  return ALLERGENS.map((a) => a.code).filter((code) => chosen.has(code));
}

/**
 * One line of composition, or null for blank: one line, at most 400 characters
 * (a guest reads it on a phone, under the dish's name).
 */
export function normalizeComposition(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new AllergenError('Склад має бути текстом');
  const text = oneLine(raw);
  if (text.length > COMPOSITION_MAX) {
    throw new AllergenError(`Склад задовгий: не більше ${COMPOSITION_MAX} символів`);
  }
  return text || null;
}

/** A stored set as the page prints it: labels, in canonical order; codes it does not know are dropped. */
export function allergenLabels(codes: readonly string[] | null | undefined): Allergen[] {
  const have = new Set(codes ?? []);
  return ALLERGENS.filter((a) => have.has(a.code));
}
