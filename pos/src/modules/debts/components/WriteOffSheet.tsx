// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner forgives what is still owed on some lines, or on all of them
// (G3_DEBTS.md, decision 7). No stock moves — the goods are not in the shop —
// and no receipt is made, because no money changed hands. The reason is what
// the journal keeps of the decision, so it is required.
//
// The server refuses anyone but the owner; the statement shows this sheet to
// the owner only.

import { useMemo, useState } from 'react';
import { formatUah } from '@pos/platform';
import { Check } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import { lineTitle, quantityText } from '../lib/debt';
import { debtFailure } from '../lib/errors';
import { customerScope } from '../lib/pendingKeys';
import { publishCredit } from '../lib/useCredit';
import { useWriteKey } from '../lib/useWriteKey';
import type { DebtLine } from '../lib/types';
import { Sheet } from './Sheet';

const REASON_MIN = 3;

const NO_ANSWER = 'Немає відповіді від сервера — списання могло пройти. Натисніть ще раз: удруге воно не запишеться.';
const EARLIER_NO_ANSWER =
  'Попереднє списання лишилося без відповіді — воно могло пройти. Натисніть ще раз: удруге воно не запишеться.';
const REPLAYED = 'Це списання вже було записано — удруге не записано. Виписку оновлено.';

interface Props {
  customerId: number;
  openLines: DebtLine[];
  onClose: () => void;
  onChanged: () => void;
}

export function WriteOffSheet({ customerId, openLines, onClose, onChanged }: Props) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(openLines.map((line) => line.id)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const writeKey = useWriteKey(customerScope('writeoff', customerId));
  const [error, setError] = useState<string | null>(() => (writeKey.replaying ? EARLIER_NO_ANSWER : null));

  const total = useMemo(
    () => openLines.filter((line) => chosen.has(line.id)).reduce((sum, line) => sum + line.owed_cents, 0),
    [openLines, chosen]
  );
  const reasonOk = reason.trim().length >= REASON_MIN;

  function toggle(id: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (busy || chosen.size === 0 || !reasonOk) return;
    setBusy(true);
    setError(null);
    try {
      const result = await debtsApi.writeOff(customerId, {
        line_ids: openLines.filter((line) => chosen.has(line.id)).map((line) => line.id),
        reason: reason.trim(),
        client_uuid: writeKey.current(),
      });
      writeKey.answered();
      publishCredit(result.credit);
      onChanged();
      // A replay answers with the write-off made the first time: say so and
      // stay, rather than close as if the lines chosen now were written off.
      if (result.replay) setError(REPLAYED);
      else onClose();
    } catch (e) {
      const failed = debtFailure(e, 'Не вдалося списати борг');
      if (failed.unknown) {
        writeKey.unanswered();
        setError(NO_ANSWER);
      } else {
        writeKey.answered();
        setError(failed.text);
      }
      if (failed.code === 'stale_statement') onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Списати борг" onClose={onClose} wide testId="debts-writeoff-sheet">
      <div className="space-y-4">
        <p className="text-[13px] text-sq-muted">
          Борг за обраними товарами закривається без грошей і без чека. Товар не повертається на полицю.
        </p>
        <ul className="rounded-xl ring-1 ring-sq-divider overflow-hidden">
          {openLines.map((line) => {
            const on = chosen.has(line.id);
            return (
              <li key={line.id} className="border-b border-sq-divider/70 last:border-b-0">
                <button
                  type="button"
                  aria-pressed={on}
                  className={`w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${on ? 'bg-sq-selected' : 'bg-white'}`}
                  onClick={() => toggle(line.id)}
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-md grid place-items-center ${on ? 'bg-sq-blue text-white' : 'ring-1 ring-sq-divider'}`}
                    aria-hidden
                  >
                    {on && <Check size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] truncate">{lineTitle(line)}</span>
                    <span className="block text-[13px] text-sq-muted">
                      {quantityText(line.remaining_quantity, line.unit)}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums shrink-0">{formatUah(line.owed_cents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <label className="block">
          <span className="text-[13px] font-semibold text-sq-secondary">Причина</span>
          <input
            className="pos-field mt-1 w-full"
            value={reason}
            maxLength={200}
            placeholder="Наприклад: покупець виїхав, борг безнадійний"
            onChange={(e) => setReason(e.target.value)}
          />
          {!reasonOk && reason.length > 0 && (
            <span className="mt-1 block text-[13px] text-sq-muted">Щонайменше {REASON_MIN} символи</span>
          )}
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          className="w-full min-h-[52px] rounded-xl text-[17px] font-semibold tabular-nums bg-red-600 text-white disabled:opacity-50"
          disabled={busy || chosen.size === 0 || !reasonOk}
          onClick={() => void submit()}
        >
          {busy ? 'Списую…' : `Списати ${formatUah(total)}`}
        </button>
      </div>
    </Sheet>
  );
}
