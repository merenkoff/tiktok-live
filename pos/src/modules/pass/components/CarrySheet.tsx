// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Несете на стіл 5?» — the one question between a tap and a plate marked as
// carried (Д2). It is asked at the pass, with the plate still in hand: «Несу»
// also tells every other waiter that this plate is taken. For a line of
// several it offers how many, opening on «Усі N».

import { useState } from 'react';
import { X } from '@pos/platform/ui';
import type { ServingLine } from '../lib/types';
import { dishTitle, leftOf, quantityChoices } from '../lib/feed';

interface Props {
  tableName: string;
  line: ServingLine;
  busy: boolean;
  onCarry: (quantity: number) => void;
  onClose: () => void;
}

export function CarrySheet({ tableName, line, busy, onCarry, onClose }: Props): JSX.Element {
  const left = leftOf(line);
  const choices = quantityChoices(left);
  const [quantity, setQuantity] = useState(left);
  return (
    <div className="fixed inset-0 z-50" data-testid="carry-sheet">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" aria-label="Закрити" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`Несете на стіл ${tableName}?`}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-card bg-sq-sidebar px-5 pt-3 pb-5 shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up"
      >
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[21px] font-bold text-sq-heading">Несете на стіл {tableName}?</p>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-[17px] font-semibold text-sq-text" data-testid="carry-dish">
          {dishTitle(line)}
        </p>
        {line.note && <p className="text-[15px] font-semibold text-[#B35F0C]">{line.note}</p>}

        {choices.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Скільки">
            {choices.map((n) => (
              <button
                key={n}
                type="button"
                className={`min-h-12 min-w-12 rounded-xl px-4 text-[17px] font-semibold tabular-nums ${
                  quantity === n ? 'bg-sq-blue text-white' : 'bg-white ring-1 ring-sq-divider text-sq-text'
                }`}
                data-testid={`carry-qty-${n}`}
                aria-pressed={quantity === n}
                onClick={() => setQuantity(n)}
              >
                {n === left ? `Усі ${n}` : n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="min-h-14 rounded-xl bg-white ring-1 ring-sq-divider text-[17px] font-semibold text-sq-text"
            data-testid="carry-no"
            onClick={onClose}
          >
            Ні
          </button>
          <button
            type="button"
            className="pos-btn-primary min-h-14 rounded-xl text-[17px]"
            data-testid="carry-yes"
            disabled={busy}
            onClick={() => onCarry(quantity)}
          >
            Несу{quantity > 1 ? ` ${quantity}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
