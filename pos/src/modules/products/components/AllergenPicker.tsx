// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ALLERGENS } from './allergens';

/**
 * Which of the fourteen allergens a dish contains — ticked chips, saved as a
 * set. The result is always in the list's own order, so the same choice is the
 * same array however the owner tapped it.
 *
 * An empty choice means «не вказано», never «алергенів немає»: the guest's page
 * prints allergens only when some are ticked, and there is deliberately no chip
 * that claims a dish is free of them.
 */
export function AllergenPicker({
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
    onChange(ALLERGENS.map((a) => a.code).filter((c) => chosen.has(c)));
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-sq-secondary mb-2">Алергени</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Алергени">
        {ALLERGENS.map((allergen) => {
          const on = value.includes(allergen.code);
          return (
            <button
              key={allergen.code}
              type="button"
              onClick={() => toggle(allergen.code)}
              aria-pressed={on}
              data-testid={`allergen-chip-${allergen.code}`}
              className={`inline-flex items-center min-h-9 px-3 rounded-[10px] text-[15px] transition-colors ${
                on
                  ? 'bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold'
                  : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar'
              }`}
            >
              {allergen.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-sq-muted">
        Відмітьте те, що є в страві. Якщо нічого не відмічено, гість не побачить нічого про алергени — це не
        означає, що їх немає.
      </p>
    </div>
  );
}
