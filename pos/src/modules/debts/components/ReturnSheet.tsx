// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Taking goods back from lines nobody has paid for yet (G3_DEBTS.md, decision
// 6): any open line, any part of what is still on it. The goods go back on the
// shelf and the debt goes down by exactly what those units were worth — the
// same cumulative rounding a refund uses (`refundLineAmount`), so the units of
// a discounted line always add up to its total whatever order they come back in.
//
// No money moves and no receipt is made: nothing was ever paid for these.

import { useMemo, useState } from 'react';
import { cashierApi, formatUah, isOfflinePosEnabled } from '@pos/platform';
import { Minus, Plus } from '@pos/platform/ui';
import { debtsApi } from '../lib/debtsApi';
import { lineTitle, quantityText, returnAmount } from '../lib/debt';
import { debtFailure } from '../lib/errors';
import { customerScope } from '../lib/pendingKeys';
import { publishCredit } from '../lib/useCredit';
import { useWriteKey } from '../lib/useWriteKey';
import type { DebtLine } from '../lib/types';
import { Sheet } from './Sheet';

const NO_ANSWER = 'Немає відповіді від сервера — повернення могло пройти. Натисніть ще раз: удруге воно не запишеться.';
const EARLIER_NO_ANSWER =
  'Попереднє повернення лишилося без відповіді — воно могло пройти. Оберіть товар і натисніть ще раз: удруге воно не запишеться.';
const REPLAYED = 'Це повернення вже було записано — удруге не записано. Виписку оновлено.';

interface Props {
  customerId: number;
  openLines: DebtLine[];
  onClose: () => void;
  onChanged: () => void;
}

export function ReturnSheet({ customerId, openLines, onClose, onChanged }: Props) {
  const [take, setTake] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const writeKey = useWriteKey(customerScope('return', customerId));
  const [error, setError] = useState<string | null>(() => (writeKey.replaying ? EARLIER_NO_ANSWER : null));

  const chosen = openLines.filter((line) => (take[line.id] ?? 0) > 0);
  const total = useMemo(
    () => openLines.reduce((sum, line) => sum + returnAmount(line, take[line.id] ?? 0), 0),
    [openLines, take]
  );

  function set(line: DebtLine, value: number) {
    const clamped = Math.max(0, Math.min(line.remaining_quantity, Math.round(value)));
    setTake((prev) => ({ ...prev, [line.id]: clamped }));
  }

  async function submit() {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await debtsApi.returnGoods(customerId, {
        lines: chosen.map((line) => ({ line_id: line.id, quantity: take[line.id] })),
        client_uuid: writeKey.current(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      writeKey.answered();
      publishCredit(result.credit);
      // The goods are back on the shelf; the desktop's catalogue reads its own copy of the stock.
      if (isOfflinePosEnabled()) void cashierApi.refreshCatalog().catch(() => undefined);
      onChanged();
      // A replay answers with the return made the first time, not with what is
      // chosen now: say so and stay, so a different return is still possible.
      if (result.replay) {
        setTake({});
        setError(REPLAYED);
      } else {
        onClose();
      }
    } catch (e) {
      const failed = debtFailure(e, 'Не вдалося повернути товар');
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
    <Sheet title="Повернути товар" onClose={onClose} wide testId="debts-return-sheet">
      <div className="space-y-4">
        <p className="text-[13px] text-sq-muted">
          Товар, за який ще не заплатили, повертається на полицю, а борг зменшується на його вартість.
        </p>
        <ul className="rounded-xl ring-1 ring-sq-divider overflow-hidden">
          {openLines.map((line) => {
            const n = take[line.id] ?? 0;
            const piece = line.unit === '' || line.unit === 'шт';
            return (
              <li key={line.id} className="border-b border-sq-divider/70 last:border-b-0 px-3 py-2.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[15px]">{lineTitle(line)}</span>
                    <span className="block text-[13px] text-sq-muted">
                      винно за {quantityText(line.remaining_quantity, line.unit)} · {formatUah(line.owed_cents)}
                    </span>
                  </span>
                  {n > 0 && (
                    <span className="text-[15px] font-semibold tabular-nums shrink-0">−{formatUah(returnAmount(line, n))}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {piece ? (
                    <>
                      <button
                        type="button"
                        aria-label="Менше"
                        className="h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider"
                        onClick={() => set(line, n - 1)}
                      >
                        <Minus size={20} />
                      </button>
                      <span className="w-10 text-center text-[17px] font-semibold tabular-nums">{n}</span>
                      <button
                        type="button"
                        aria-label="Більше"
                        className="h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider"
                        onClick={() => set(line, n + 1)}
                      >
                        <Plus size={20} />
                      </button>
                    </>
                  ) : (
                    <input
                      className="pos-field w-32"
                      inputMode="numeric"
                      aria-label={`Скільки повернути, ${line.unit}`}
                      value={n === 0 ? '' : String(n)}
                      placeholder={`0 ${line.unit}`}
                      onChange={(e) => set(line, Number(e.target.value.replace(/\D/g, '')) || 0)}
                    />
                  )}
                  <button
                    type="button"
                    className="ml-auto text-[15px] font-semibold text-sq-blue"
                    onClick={() => set(line, n === line.remaining_quantity ? 0 : line.remaining_quantity)}
                  >
                    {n === line.remaining_quantity ? 'Скинути' : 'Усе'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <label className="block">
          <span className="text-[13px] font-semibold text-sq-secondary">Причина (необовʼязково)</span>
          <input
            className="pos-field mt-1 w-full"
            value={reason}
            maxLength={200}
            placeholder="Наприклад: не підійшов розмір"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums"
          disabled={busy || chosen.length === 0}
          onClick={() => void submit()}
        >
          {busy ? 'Повертаю…' : chosen.length === 0 ? 'Оберіть, що повертається' : `Повернути на ${formatUah(total)}`}
        </button>
      </div>
    </Sheet>
  );
}
