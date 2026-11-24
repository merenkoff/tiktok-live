// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The row of tables at the top of «Роздача» (Д2): «Усі» first, then every
// table with an open bill in the order a waiter should walk (`chipOrder`),
// each with the number of plates still to carry. A table with nothing to carry
// stays in the row, dimmed — its «Винесено» is still worth opening. Scrolls
// sideways on a phone.

import type { ServingTable } from '../lib/types';
import { tableState } from '../lib/feed';

export type Selection = 'all' | number;

interface Props {
  tables: ServingTable[];
  selected: Selection;
  roomCount: number;
  onSelect: (selection: Selection) => void;
}

export function TableChips({ tables, selected, roomCount, onSelect }: Props): JSX.Element {
  const chip = (active: boolean, dim: boolean): string =>
    `shrink-0 min-h-11 rounded-full px-4 inline-flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap ring-1 ${
      active ? 'bg-sq-blue text-white ring-sq-blue' : 'bg-white text-sq-text ring-sq-divider'
    } ${dim && !active ? 'opacity-50' : ''}`;
  const count = (n: number, active: boolean): JSX.Element => (
    <span
      className={`min-w-6 h-6 px-1.5 rounded-full text-[13px] tabular-nums inline-flex items-center justify-center ${
        active ? 'bg-white/25 text-white' : n > 0 ? 'bg-sq-blue/10 text-sq-blue' : 'bg-sq-empty text-sq-muted'
      }`}
    >
      {n}
    </span>
  );

  return (
    <nav className="flex gap-2 overflow-x-auto px-4 md:px-6 py-2 -mx-0" aria-label="Столи" data-testid="pass-chips">
      <button
        type="button"
        className={chip(selected === 'all', false)}
        data-testid="pass-chip-all"
        aria-pressed={selected === 'all'}
        onClick={() => onSelect('all')}
      >
        Усі
        {count(roomCount, selected === 'all')}
      </button>
      {tables.map((table) => {
        const active = selected === table.bill_id;
        const state = tableState(table);
        return (
          <button
            key={table.bill_id}
            type="button"
            className={chip(active, state === 'done')}
            data-testid={`pass-chip-${table.bill_id}`}
            data-state={state}
            aria-pressed={active}
            onClick={() => onSelect(table.bill_id)}
          >
            {state === 'ready' && (
              <span aria-hidden className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-sq-success'}`} />
            )}
            Стіл {table.table_name}
            {count(table.to_serve, active)}
          </button>
        );
      })}
    </nav>
  );
}
