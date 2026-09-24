// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Putting a cart aside (`TechDocs/POS_FLORIST_BENCH.md` §9).
 *
 * One field, because there is one thing the other till needs to know: what to
 * call it. The name is required — a parked cart nobody can ask for by name is
 * one nobody finds again, and the list at the other till is read out loud
 * («Оксана, троянди»).
 *
 * The customer's name is offered as the default when the cart has one, because
 * that is what the cashier would have typed anyway.
 *
 * Online only, and it says so rather than timing out: parking means the server
 * issuing an id and holding the stock. A cart parked only on this machine
 * would solve the smaller half of the problem — the half where the customer
 * comes back to the same till.
 */

import { useState } from 'react';
import { Inbox, X } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';

interface Props {
  totalCents: number;
  lineCount: number;
  defaultLabel?: string;
  online: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (label: string, note: string | null) => void;
  onClose: () => void;
}

export function ParkCartSheet({
  totalCents,
  lineCount,
  defaultLabel,
  online,
  busy,
  error,
  onSubmit,
  onClose,
}: Props) {
  const [label, setLabel] = useState(defaultLabel ?? '');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label="Відкласти кошик"
        className="bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
        data-testid="park-cart-sheet"
      >
        <div className="pl-5 pr-3 pt-4 pb-2 flex items-center justify-between gap-3">
          <h3 className="text-[19px] font-bold text-sq-heading">Відкласти кошик</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40 shrink-0"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-1 pb-5 space-y-4">
          <p className="text-sm text-sq-secondary">
            {lineCount} поз. на <span className="tabular-nums">{formatUah(totalCents)}</span>. Товар буде зарезервовано на 4 години —
            його не запропонують іншій касі, доки кошик не заберуть або не повернуть.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Для кого</span>
            <input
              className="pos-field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Оксана, троянди"
              autoFocus
              data-testid="park-label"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Примітка</span>
            <input
              className="pos-field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Забере після 17:00"
              data-testid="park-note"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="park-error">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !online || !label.trim()}
            onClick={() => onSubmit(label.trim(), note.trim() || null)}
            className="pos-btn-primary min-h-[52px] w-full rounded-xl text-[17px] gap-2"
            data-testid="park-submit"
          >
            <Inbox size={20} />
            {!online ? 'Потрібна мережа' : busy ? 'Відкладаємо…' : 'Відкласти'}
          </button>
        </div>
      </div>
    </div>
  );
}
