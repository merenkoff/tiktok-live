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
import { Inbox, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div
        className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg"
        data-testid="park-cart-sheet"
      >
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Відкласти кошик</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-sq-muted">
            {lineCount} поз. на {formatUah(totalCents)}. Товар буде зарезервовано на 4 години —
            його не запропонують іншій касі, доки кошик не заберуть або не повернуть.
          </p>

          <label className="block">
            <span className="text-sm text-sq-secondary">Для кого</span>
            <input
              className="pos-field mt-1.5"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Оксана, троянди"
              autoFocus
              data-testid="park-label"
            />
          </label>

          <label className="block">
            <span className="text-sm text-sq-secondary">Примітка</span>
            <input
              className="pos-field mt-1.5"
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
            className="sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2"
            data-testid="park-submit"
          >
            <Inbox size={18} />
            {!online ? 'Потрібна мережа' : busy ? 'Відкладаємо…' : 'Відкласти'}
          </button>
        </div>
      </div>
    </div>
  );
}
