// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/menu-labels.ts — the labels a dish may carry on the guest's QR menu
// (migration 086, TechDocs/POS_QR_MENU_FEEDBACK.md phase F9).
//
// A fixed set of six, in code: a label is an icon, a colour and a word the
// page draws, so a free-text one would be a word with no icon (decision Д20).
// Ticked by the owner on the product card — «Новинка» and «Хіт» by hand too,
// because a card's date of creation lies for an imported menu (every card
// made on one day) and a «hit» by sales belongs on «Сьогодні» (Д21) — and
// shown on every card, one nobody has reviewed included: they are the
// owner's own ticks, not the internal text 060 keeps off the page.
//
// Deliberately no «без глютену», which ChoiceQR offers: it is a claim that an
// allergen is ABSENT, and the one thing this till says about allergens is
// what IS in a dish (`allergens.ts`, Д17). The empty set says nothing, which
// for a label is simply the truth — there is no «not said» ambiguity here.
//
// The client keeps a copy of this list (`pos/src/modules/products/components/
// menuLabels.ts`) because `rootDir` keeps the two apps from importing each
// other; `pos.public-menu.dishfacts.test.ts` compares them.

export interface MenuLabel {
  code: string;
  label: string;
}

/** In the order a guest reads them; the canonical order of a stored set as well. */
export const MENU_LABELS: readonly MenuLabel[] = [
  { code: 'spicy', label: 'Гостре' },
  { code: 'vegetarian', label: 'Вегетаріанське' },
  { code: 'vegan', label: 'Веганське' },
  { code: 'new', label: 'Новинка' },
  { code: 'hit', label: 'Хіт' },
  { code: 'recommended', label: 'Рекомендуємо' },
];

const WORDS = new Map(MENU_LABELS.map((l) => [l.code, l.label]));

/** Thrown for a value the owner can fix; the routes answer it with a 400 and the message as is. */
export class MenuLabelError extends Error {}

/**
 * The set an owner sent, checked and put in canonical order without repeats.
 * A code that is not on the list is refused (a typo must not become a chip
 * the page cannot draw), `null` reads as the empty set.
 */
export function normalizeMenuLabels(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new MenuLabelError('Позначки страви: очікується список');
  const chosen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' || !WORDS.has(value)) {
      throw new MenuLabelError(`Позначки страви: невідомий код «${String(value)}»`);
    }
    chosen.add(value);
  }
  return MENU_LABELS.map((l) => l.code).filter((code) => chosen.has(code));
}

/** A stored set as the page prints it: code + word, in canonical order; codes it does not know are dropped. */
export function menuLabelItems(codes: readonly string[] | null | undefined): MenuLabel[] {
  const have = new Set(codes ?? []);
  return MENU_LABELS.filter((l) => have.has(l.code));
}
