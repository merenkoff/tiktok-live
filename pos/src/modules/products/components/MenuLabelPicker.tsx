// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { MENU_LABELS } from './menuLabels';

/**
 * The chips a dish carries on the guest's QR menu — «Гостре», «Хіт»… — ticked
 * here, saved as a set that always comes out in the list's own order, so the
 * same choice is the same array however the owner tapped it (phase F9).
 *
 * «Новинка» and «Хіт» are the owner's to put on and take off: the till does
 * not derive them from a card's date (every card of an imported menu was made
 * on one day) or from sales (that figure lives on «Сьогодні»). And there is no
 * «без глютену» on purpose: it would claim an allergen is absent, and the one
 * thing the till says about allergens is what IS in a dish.
 */
export function MenuLabelPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(code: string) {
    const chosen = new Set(value);
    if (chosen.has(code)) chosen.delete(code);
    else chosen.add(code);
    onChange(MENU_LABELS.map((l) => l.code).filter((c) => chosen.has(c)));
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-sq-secondary mb-2">Позначки в QR-меню</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Позначки в QR-меню">
        {MENU_LABELS.map((item) => {
          const on = value.includes(item.code);
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => toggle(item.code)}
              aria-pressed={on}
              data-testid={`menu-label-chip-${item.code}`}
              className={`inline-flex items-center min-h-9 px-3 rounded-[10px] text-[15px] transition-colors ${
                on
                  ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold'
                  : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-sq-muted">
        Гість бачить їх під назвою страви, в меню і в картці страви. «Новинку» і «Хіт» ставите й знімаєте ви самі —
        каса не рахує їх за датою картки чи продажами.
      </p>
    </div>
  );
}
