// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Винесено» — every plate of the chosen table that has gone out, newest
// first, with who carried it and when (Д2). «Повернути» stands beside a
// waiter's own tap for ten minutes; the kitchen's rows («Кухня · …», the rest
// of a round it handed over itself) never have it.

import { Check, RotateCcw } from '@pos/platform/ui';
import type { ServingHistoryRow } from '../lib/types';
import { dishTitle, hhmm } from '../lib/feed';

interface Props {
  rows: ServingHistoryRow[];
  busy: boolean;
  onUndo: (row: ServingHistoryRow) => void;
}

export function ServedHistory({ rows, busy, onUndo }: Props): JSX.Element {
  return (
    <section className="rounded-2xl bg-white shadow-card px-4 py-3" data-testid="pass-history">
      <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
        <Check size={20} className="text-sq-success" />
        <p className="flex-1 text-[15px] font-bold text-sq-heading">Винесено</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-sq-muted">Ще нічого не винесли</p>
      ) : (
        <ul className="pt-1 divide-y divide-[#EEF0F3]">
          {rows.map((row) => {
            const undone = row.undone_at != null;
            return (
              <li
                key={row.id}
                className={`flex items-center gap-3 py-2 ${undone ? 'opacity-50' : ''}`}
                data-testid={`pass-history-${row.id}`}
              >
                <span className="w-9 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums">
                  {row.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] text-sq-text ${undone ? 'line-through' : ''}`}>
                    {dishTitle({ product_name: row.product_name, caption: row.caption })}
                  </span>
                  <span className="block text-[13px] text-sq-muted">
                    {row.served_by_name} · {hhmm(row.served_at)} · раунд {row.round_seq}
                    {undone ? ' · повернуто' : ''}
                  </span>
                </span>
                {row.undoable && (
                  <button
                    type="button"
                    className="shrink-0 min-h-10 px-2 inline-flex items-center gap-1 rounded-lg text-[14px] font-semibold text-sq-blue disabled:opacity-40"
                    data-testid={`pass-history-undo-${row.id}`}
                    disabled={busy}
                    onClick={() => onUndo(row)}
                  >
                    <RotateCcw size={16} />
                    Повернути
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
