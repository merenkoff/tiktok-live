// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { AllergenPicker } from './AllergenPicker';
import { COMPOSITION_MAX } from './allergens';

/**
 * What the guest reads about a dish on the QR menu beyond its name and price:
 * a line of composition and the allergens — the same two fields in the create
 * and the edit form. The composition is what the OWNER writes, not the recipe:
 * a recipe lists stock (a cup, a lid), leaves out what a modifier adds, and
 * never leaves the server.
 */
export function DishFactsFields({
  composition,
  onComposition,
  allergens,
  onAllergens,
}: {
  composition: string;
  onComposition: (next: string) => void;
  allergens: string[];
  onAllergens: (next: string[]) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[13px] font-semibold text-sq-secondary">Склад для гостя</span>
        <textarea
          className="sq-input min-h-20"
          rows={2}
          maxLength={COMPOSITION_MAX}
          placeholder="Еспресо, молоко"
          value={composition}
          onChange={(e) => onComposition(e.target.value)}
        />
        <span className="text-[13px] text-sq-muted">
          Гість бачить це в QR-меню під назвою страви · до {COMPOSITION_MAX} символів. Це не рецепт, а те, що ви
          самі напишете.
        </span>
      </label>
      <AllergenPicker value={allergens} onChange={onAllergens} />
    </>
  );
}
