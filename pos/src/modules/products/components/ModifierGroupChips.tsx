// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModifierGroup } from '@pos/platform';

/**
 * Which questions a product asks, in the order the till will ask them.
 *
 * A tap appends, a second tap removes, and the number on a chip is its place
 * — the order is the `sort_order` the server stores, so «Молоко» before
 * «Сироп» here is «Молоко» before «Сироп» on the sheet. Saved wholesale, like
 * tags, so taking a question away is expressible.
 */
export function ModifierGroupChips({
  groups,
  value,
  onChange,
}: {
  groups: ModifierGroup[];
  value: number[];
  onChange: (next: number[]) => void;
}) {
  // An inactive group stays visible while the product still asks it, so the
  // owner can see — and remove — a question the till no longer shows.
  const shown = groups.filter((g) => g.is_active || value.includes(g.id));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-semibold text-sq-secondary mb-2">Модифікатори</p>
      <div className="flex flex-wrap gap-2">
        {shown.map((group) => {
          const index = value.indexOf(group.id);
          const on = index >= 0;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => toggle(group.id)}
              aria-pressed={on}
              data-testid={`modifier-group-chip-${group.id}`}
              className={`inline-flex items-center gap-1.5 text-sm border rounded-full px-2.5 py-1 ${
                on
                  ? 'border-sq-blue bg-sq-blue text-white'
                  : 'border-sq-divider bg-sq-bg text-sq-text'
              }`}
            >
              {on && <span className="text-[11px] font-semibold tabular-nums">{index + 1}</span>}
              {group.name}
              <span className={`text-[11px] ${on ? 'opacity-80' : 'text-sq-secondary'}`}>
                {group.min_select >= 1 ? 'обовʼязково' : 'за бажанням'}
              </span>
            </button>
          );
        })}
        {shown.length === 0 && (
          <span className="text-sm text-sq-muted">
            Немає груп — заведіть їх на сторінці «Модифікатори»
          </span>
        )}
      </div>
    </div>
  );
}
