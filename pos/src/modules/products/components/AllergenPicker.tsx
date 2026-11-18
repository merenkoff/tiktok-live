// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ALLERGENS } from './allergens';
import type { AllergenHint } from '../lib/allergenHints';

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
  hints = [],
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** What the recipe suggests (`allergenHints`) — offered, never ticked by itself. */
  hints?: readonly AllergenHint[];
}) {
  const open = hints.filter((hint) => !value.includes(hint.code));

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
      {open.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="allergen-hints">
          <span className="text-[13px] text-sq-muted mr-0.5">Можливо, є в страві — перевірте:</span>
          {open.map((hint) => (
            <button
              key={hint.code}
              type="button"
              onClick={() => toggle(hint.code)}
              data-testid={`allergen-hint-${hint.code}`}
              title={hint.fromCard ? 'Відмічено в картці інгредієнта' : 'Здогад за назвою інгредієнта'}
              className="min-h-8 px-2.5 rounded-full bg-sq-sidebar text-[14px] text-sq-text hover:bg-sq-selected"
            >
              + {hint.label}
              {hint.from.length > 0 && (
                <span className="text-sq-muted"> ({hint.from.slice(0, 3).join(', ')}{hint.from.length > 3 ? '…' : ''})</span>
              )}
            </button>
          ))}
          <p className="basis-full text-[12px] leading-snug text-sq-muted">
            Підказка за складом рецепта: за назвами інгредієнтів і тим, що відмічено в їхніх картках. Вона може
            помилятися й не бачить того, чого назва не каже, — соєвого соусу в «маринаді». Відмічаєте лише ви.
          </p>
        </div>
      )}
      <p className="mt-2 text-[13px] leading-relaxed text-sq-muted">
        Відмітьте те, що є в страві. Якщо нічого не відмічено, гість не побачить нічого про алергени — це не
        означає, що їх немає.
      </p>
    </div>
  );
}
