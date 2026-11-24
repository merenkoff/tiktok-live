// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Скільки гостей?» — asked when a free table is tapped, and again from the
// bill's header (TechDocs/POS_TABLES.md §4.1).
//
// A number is what seats the table: until then a tap only LOOKS at it, and the
// map keeps it free. «Пізніше» opens the bill screen without seating anyone —
// the first dish will. One tap for the usual party (1–8); a stepper past that,
// up to the server's 99.

import { useState } from 'react';
import { Minus, Plus, X } from '@pos/platform/ui';

export interface GuestsSheetProps {
  /** «Стіл 5» — whose guests these are. */
  title: string;
  /** The count already on the bill; none for a free table. */
  current?: number | null;
  busy?: boolean;
  onPick: (guests: number) => void;
  /** «Пізніше» for a free table; absent when changing a count (the close button is enough). */
  onLater?: () => void;
  onClose: () => void;
}

const QUICK = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX_GUESTS = 99;

export function GuestsSheet({ title, current = null, busy = false, onPick, onLater, onClose }: GuestsSheetProps): JSX.Element {
  // Past eight the stepper takes over, starting from nine (or the count already set).
  const [many, setMany] = useState<number | null>(current != null && current > QUICK.length ? current : null);
  const chip = (selected: boolean): string =>
    `min-h-14 rounded-xl text-[19px] font-semibold tabular-nums disabled:opacity-40 ${
      selected ? 'bg-sq-blue text-white' : 'bg-white ring-1 ring-sq-divider text-sq-text'
    }`;

  return (
    <div className="fixed inset-0 z-50" data-testid="guests-sheet">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" aria-label="Закрити" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Скільки гостей?"
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-card bg-sq-sidebar px-5 pt-3 pb-5 shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold text-sq-heading">Скільки гостей?</p>
            <p className="text-[14px] text-sq-muted">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
            aria-label="Закрити"
            data-testid="guests-close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              className={chip(current === n && many == null)}
              data-testid={`guests-${n}`}
              disabled={busy}
              onClick={() => onPick(n)}
            >
              {n}
            </button>
          ))}
        </div>

        {many == null ? (
          <button
            type="button"
            className="mt-2.5 w-full min-h-12 rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text disabled:opacity-40"
            data-testid="guests-more"
            disabled={busy}
            onClick={() => setMany(QUICK.length + 1)}
          >
            Більше 8
          </button>
        ) : (
          <div className="mt-2.5 flex items-center gap-2.5" data-testid="guests-stepper">
            <button
              type="button"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white ring-1 ring-sq-divider disabled:opacity-40"
              aria-label="Менше"
              data-testid="guests-stepper-less"
              disabled={busy || many <= 1}
              onClick={() => setMany((n) => Math.max(1, (n ?? 1) - 1))}
            >
              <Minus size={20} />
            </button>
            <span className="min-w-12 text-center text-[22px] font-bold tabular-nums" data-testid="guests-stepper-value">
              {many}
            </span>
            <button
              type="button"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white ring-1 ring-sq-divider disabled:opacity-40"
              aria-label="Більше"
              data-testid="guests-stepper-more"
              disabled={busy || many >= MAX_GUESTS}
              onClick={() => setMany((n) => Math.min(MAX_GUESTS, (n ?? 1) + 1))}
            >
              <Plus size={20} />
            </button>
            <button
              type="button"
              className="pos-btn-primary min-h-12 flex-1 rounded-xl text-[16px]"
              data-testid="guests-stepper-done"
              disabled={busy}
              onClick={() => onPick(many)}
            >
              Готово
            </button>
          </div>
        )}

        {onLater && (
          <button
            type="button"
            className="mt-3 w-full min-h-11 text-[16px] font-semibold text-sq-blue disabled:opacity-40"
            data-testid="guests-later"
            disabled={busy}
            onClick={onLater}
          >
            Пізніше
          </button>
        )}
      </div>
    </div>
  );
}
