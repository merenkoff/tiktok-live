// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { AllergenPicker } from './AllergenPicker';
import { COMPOSITION_MAX } from './allergens';
import { MenuLabelPicker } from './MenuLabelPicker';

/**
 * What the guest reads about a dish on the QR menu beyond its name and price:
 * a line of composition, the allergens, the labels («Гостре», «Хіт»…, F9) and
 * the facts line's three numbers (calories of the portion, a drink's
 * strength, minutes to prepare — F14) — the same fields in the create and
 * the edit form. The composition is what the OWNER writes, not the recipe: a
 * recipe lists stock (a cup, a lid), leaves out what a modifier adds, and
 * never leaves the server. The numbers are text here, typed digit by digit;
 * the server parses them and answers a bad one with a sentence the card
 * shows as is.
 */
export function DishFactsFields({
  composition,
  onComposition,
  allergens,
  onAllergens,
  menuLabels,
  onMenuLabels,
  kcal,
  onKcal,
  strength,
  onStrength,
  prepMinutes,
  onPrepMinutes,
}: {
  composition: string;
  onComposition: (next: string) => void;
  allergens: string[];
  onAllergens: (next: string[]) => void;
  menuLabels: string[];
  onMenuLabels: (next: string[]) => void;
  /** Calories of the portion as served, as typed ('' = not said). */
  kcal: string;
  onKcal: (next: string) => void;
  /** The strength as a percent («4,5»), as typed ('' = not said). */
  strength: string;
  onStrength: (next: string) => void;
  /** Minutes to prepare, as typed ('' = not said). */
  prepMinutes: string;
  onPrepMinutes: (next: string) => void;
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
      <MenuLabelPicker value={menuLabels} onChange={onMenuLabels} />
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">Калорійність, ккал</span>
          <input
            className="sq-input"
            inputMode="numeric"
            placeholder="420"
            value={kcal}
            onChange={(e) => onKcal(e.target.value)}
          />
          <span className="text-[13px] text-sq-muted">На порцію, як подається. Гість бачить «420 ккал» під ціною.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">Міцність, %</span>
          <input
            className="sq-input"
            inputMode="decimal"
            placeholder="4,5"
            value={strength}
            onChange={(e) => onStrength(e.target.value)}
          />
          <span className="text-[13px] text-sq-muted">Для напоїв; 0 — безалкогольне. Гість бачить «міцність 4,5 %».</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">Готується, хв</span>
          <input
            className="sq-input"
            inputMode="numeric"
            placeholder="25"
            value={prepMinutes}
            onChange={(e) => onPrepMinutes(e.target.value)}
          />
          <span className="text-[13px] text-sq-muted">Орієнтовно — гість бачить «готується ≈ 25 хв».</span>
        </label>
      </div>
    </>
  );
}
