// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's say over one customer's credit (decisions Д2, Д3): the limit,
// taking it away, and locking new handovers while the debt is sorted out.
//
// Only the owner sees this, and the server refuses anyone else (`PATCH
// /debts/customers/:id/credit` is `ensurePosOwner`). A limit below what is
// already owed is allowed — new credit stops, the debt stays — and so is
// taking the limit away with a debt still open: it only means «no more».

import { useEffect, useState } from 'react';
import { formatUah } from '@pos/platform';
import { debtsApi } from '../lib/debtsApi';
import { LIMIT_MAX_CENTS, LIMIT_MIN_CENTS, limitInputToCents } from '../lib/debt';
import { debtFailure } from '../lib/errors';
import { publishCredit } from '../lib/useCredit';
import type { DebtCredit } from '../lib/types';

interface Props {
  credit: DebtCredit;
  /** The till's touch-sized field, or the admin's compact one. */
  touch?: boolean;
}

function toInput(cents: number | null): string {
  return cents == null ? '' : String(cents / 100).replace('.', ',');
}

export function LimitEditor({ credit, touch }: Props) {
  const [text, setText] = useState(() => toInput(credit.limit_cents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Another screen (or this one) changed the limit: show what is stored now.
  useEffect(() => setText(toInput(credit.limit_cents)), [credit.limit_cents]);

  async function save(patch: { credit_limit_cents?: number | null; credit_locked?: boolean }, done: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      publishCredit(await debtsApi.setCredit(credit.customer_id, patch));
      setSaved(done);
    } catch (e) {
      setError(debtFailure(e, 'Не вдалося зберегти').text);
    } finally {
      setBusy(false);
    }
  }

  function saveLimit() {
    const cents = limitInputToCents(text);
    if (cents == null || cents < LIMIT_MIN_CENTS || cents > LIMIT_MAX_CENTS) {
      setError(`Ліміт — від ${formatUah(LIMIT_MIN_CENTS)} до ${formatUah(LIMIT_MAX_CENTS)}`);
      return;
    }
    void save({ credit_limit_cents: cents }, 'Ліміт збережено');
  }

  const field = touch ? 'pos-field' : 'sq-input';
  const allowed = credit.limit_cents != null;

  return (
    <div className="space-y-2" data-testid="debts-limit-editor">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveLimit();
        }}
      >
        <label className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-sq-secondary">
            {allowed ? 'Ліміт під запис, ₴' : 'Дозволити під запис — ліміт, ₴'}
          </span>
          <input
            className={`${field} w-full`}
            inputMode="decimal"
            value={text}
            placeholder="Наприклад: 2000"
            aria-label="Ліміт під запис, гривень"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button type="submit" className="sq-btn-quiet" disabled={busy}>
          {allowed ? 'Зберегти' : 'Дозволити'}
        </button>
      </form>
      {allowed && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="sq-btn-quiet"
            disabled={busy}
            onClick={() =>
              void save(
                { credit_locked: !credit.locked },
                credit.locked ? 'Записи знову дозволено' : 'Нові записи заблоковано'
              )
            }
          >
            {credit.locked ? 'Розблокувати записи' : 'Заблокувати нові записи'}
          </button>
          <button
            type="button"
            className="sq-btn-quiet"
            disabled={busy}
            onClick={() => void save({ credit_limit_cents: null }, 'Під запис більше не дозволено')}
          >
            Заборонити під запис
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-sq-success-ink">{saved}</p>}
      {credit.set_by_name && credit.set_at && (
        <p className="text-[13px] text-sq-muted">
          Востаннє змінив(ла) {credit.set_by_name}, {new Date(credit.set_at).toLocaleDateString('uk-UA')}
        </p>
      )}
    </div>
  );
}
