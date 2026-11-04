// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Скануйте марку 1 з 2» — the excise stamps of the bottles in the cart
// (track ДК, ДК4, decision Д4: nothing goes out without its stamp). Opened by
// «Оплатити» while a line sold with a stamp per unit has fewer stamps than
// bottles, and by a refusal that names a stamp. The scanner types into the
// sheet: it carries its own `ScanWedge`, so the catalog's (covered by this
// dialog) only guards, and a scan landing anywhere — the field or not —
// becomes the next stamp. A stamp can be typed too: series and number, Enter.

import { FormEvent, useMemo, useState } from 'react';
import type { CartLine } from '@pos/platform';
import { ScanWedge } from './ScanWedge';
import { linesNeedingStamps, normalizeExciseLabel } from '../../lib/excise';
import { X } from '../../platform/glyphs';

export interface ExciseStampSheetProps {
  lines: readonly CartLine[];
  /** A refusal from the server to read first («марку … уже продано»). */
  error?: string | null;
  onSetLabels: (uid: string, labels: string[]) => void;
  /** Every line has its stamps: go on to payment. */
  onDone: () => void;
  onClose: () => void;
}

export function ExciseStampSheet({ lines, error = null, onSetLabels, onDone, onClose }: ExciseStampSheetProps) {
  const stamped = useMemo(() => lines.filter((line) => line.excise_per_unit), [lines]);
  const pending = linesNeedingStamps(stamped);
  // The line being scanned: the first still short, else the first stamped one.
  const current = pending.find((line) => (line.excise_labels?.length ?? 0) < line.quantity) ?? null;
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);

  function add(raw: string) {
    setNote(null);
    const label = normalizeExciseLabel(raw);
    if (!label) {
      setNote(`«${raw.trim().slice(0, 40)}» не схоже на акцизну марку — скануйте ще раз`);
      return;
    }
    if (stamped.some((line) => line.excise_labels?.includes(label))) {
      setNote(`Марку ${label} уже відскановано`);
      return;
    }
    if (!current) {
      setNote('Марок уже вистачає');
      return;
    }
    onSetLabels(current.uid, [...(current.excise_labels ?? []), label]);
    setTyped('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (typed.trim()) add(typed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Акцизні марки"
      className="fixed inset-0 z-50 bg-sq-bg flex flex-col text-sq-text animate-fade-up"
      data-testid="excise-sheet"
    >
      <ScanWedge active onScan={add} />
      <header className="h-[68px] shrink-0 px-4 md:px-7 flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold text-sq-heading">Акцизні марки</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 -mr-2 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 max-w-xl w-full mx-auto space-y-4">
        {error && (
          <p role="alert" className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-[15px]" data-testid="excise-error">
            {error}
          </p>
        )}

        {current ? (
          <div className="rounded-card bg-white shadow-card px-5 py-4" data-testid="excise-current">
            <p className="text-[15px] text-sq-secondary">{current.product_name}</p>
            <p className="text-[24px] font-bold text-sq-heading">
              Скануйте марку {(current.excise_labels?.length ?? 0) + 1} з {current.quantity}
            </p>
            <form onSubmit={submit} className="mt-3 flex gap-2">
              <input
                aria-label="Серія й номер марки"
                className="sq-input flex-1"
                placeholder="Або введіть: AATE 508932…"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
                data-testid="excise-input"
              />
              <button type="submit" className="sq-btn-quiet" disabled={!typed.trim()}>
                Додати
              </button>
            </form>
          </div>
        ) : (
          <p className="rounded-card bg-white shadow-card px-5 py-4 text-[17px] font-semibold text-sq-success-ink">
            Усі марки відскановано
          </p>
        )}
        {note && (
          <p role="status" className="text-[15px] text-amber-800" data-testid="excise-note">
            {note}
          </p>
        )}

        <ul className="space-y-2">
          {stamped.map((line) => {
            const have = line.excise_labels ?? [];
            return (
              <li key={line.uid} className="rounded-[14px] bg-sq-sidebar px-4 py-3" data-testid={`excise-line-${line.uid}`}>
                <p className="flex justify-between gap-3 text-[15px]">
                  <span className="font-semibold">{line.product_name}</span>
                  <span className={have.length === line.quantity ? 'text-sq-success-ink' : 'text-amber-800'}>
                    Марок {have.length} з {line.quantity}
                  </span>
                </p>
                {have.map((label) => (
                  <p key={label} className="mt-1 flex items-center justify-between gap-2 text-[13px] tabular-nums">
                    <span>{label}</span>
                    <button
                      type="button"
                      className="min-h-9 px-2 text-sq-blue font-semibold"
                      onClick={() => onSetLabels(line.uid, have.filter((l) => l !== label))}
                      aria-label={`Прибрати марку ${label}`}
                    >
                      Прибрати
                    </button>
                  </p>
                ))}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="pos-btn-primary w-full min-h-[56px] rounded-xl text-lg"
          disabled={pending.length > 0}
          onClick={onDone}
          data-testid="excise-done"
        >
          {pending.length > 0 ? 'Відскануйте всі марки' : 'До оплати'}
        </button>
      </div>
    </div>
  );
}
