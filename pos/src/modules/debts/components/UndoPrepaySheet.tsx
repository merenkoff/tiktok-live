// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Undoing a «внесок» (078, G3_DEBTS.md §11): the money goes back to the
// customer and the sum is owed again on the same goods. It is the way out of
// a mistyped sum, and the first step before goods a «внесок» was brought
// toward can be given back.
//
// The server voids the «внесок» (`POST /sales/:id/void`) and writes the
// `payment_void`; it refuses once the goods were closed by a receipt or
// written off — that receipt holds the money now — and the sheet says so in
// its words.

import { useState } from 'react';
import { formatUah } from '@pos/platform';
import { debtsApi } from '../lib/debtsApi';
import { debtFailure } from '../lib/errors';
import { lineTitle } from '../lib/debt';
import type { DebtEntry, DebtLine } from '../lib/types';
import { Sheet } from './Sheet';

interface Props {
  entry: DebtEntry;
  line: DebtLine;
  onClose: () => void;
  onChanged: () => void;
}

export function UndoPrepaySheet({ entry, line, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Math.abs(entry.amount_cents);

  async function undo() {
    if (busy || entry.sale_id == null) return;
    setBusy(true);
    setError(null);
    try {
      await debtsApi.voidPrepayment(entry.sale_id);
      onChanged();
      onClose();
    } catch (e) {
      setError(debtFailure(e, 'Не вдалося скасувати внесок').text);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Скасувати внесок?" onClose={onClose} testId="debts-undo-prepay">
      <div className="space-y-4">
        <p className="text-[15px]">
          Поверніть покупцеві <span className="font-semibold tabular-nums whitespace-nowrap">{formatUah(amount)}</span>
          {entry.receipt_number ? ` (внесок № ${entry.receipt_number})` : ''}. Ця сума знову стане боргом за «
          {lineTitle(line)}».
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="sq-btn-quiet flex-1 justify-center min-h-[48px]" onClick={onClose}>
            Ні
          </button>
          <button
            type="button"
            className="pos-btn-primary flex-1 min-h-[48px] rounded-xl"
            disabled={busy}
            onClick={() => void undo()}
          >
            {busy ? 'Скасовую…' : 'Скасувати внесок'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
