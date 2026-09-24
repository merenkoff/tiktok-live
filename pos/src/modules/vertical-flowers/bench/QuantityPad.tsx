// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * How a florist says «дев'ять», not how a computer counts to nine.
 *
 * One tap per stem is fine for greenery and hopeless for the thing a flower
 * shop actually sells: a nine-rose bouquet would be nine taps, and that alone
 * blows the speed budget in `TechDocs/POS_FLORIST_BENCH.md` §5. So a tile tap
 * both puts a stem in AND selects it, and the pad types into the selection —
 * «9 троянд» is two taps.
 *
 * Deliberately always on screen rather than behind a long-press or a dialog:
 * §4 says hands are wet and often holding a half-tied bouquet, and a gesture
 * that needs a steady 500 ms contact is the first thing such a hand fails at.
 * `0` only ever appends — «1», «0» is ten roses — and never sets a count to
 * zero: that is what the bin button is for, and a key that silently deletes a
 * row would be a worse trade. `C` puts the stem back to one and starts over.
 *
 * Keys are 1..9, C, 0 and ⌫ over two rows of six, so each stays at the 44 px
 * the same section demands (WCAG 2.5.5 Enhanced), even in the till panel.
 */

import { Delete } from '@pos/platform/ui';

interface Props {
  /** What the digits will land on — named for a screen reader; the card itself is highlighted. */
  targetName: string | null;
  onDigit: (digit: number) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del'] as const;

const keyClass =
  'min-h-11 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)] text-lg font-semibold text-sq-text grid place-items-center disabled:opacity-40 active:bg-sq-selected';

export function QuantityPad({ targetName, onDigit, onBackspace, onClear }: Props) {
  const idle = targetName == null;

  return (
    <div className="px-3 pt-1.5 pb-3" data-testid="bench-pad">
      <p className="sr-only" aria-live="polite">
        {idle ? 'Торкніться квітки, щоб набрати кількість' : `Кількість: ${targetName}`}
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {KEYS.map((key) =>
          key === 'del' ? (
            <button
              key={key}
              type="button"
              disabled={idle}
              onClick={onBackspace}
              className={keyClass}
              aria-label="Стерти цифру"
              data-testid="bench-pad-backspace"
            >
              <Delete size={20} />
            </button>
          ) : key === 'C' ? (
            <button
              key={key}
              type="button"
              disabled={idle}
              onClick={onClear}
              className={keyClass}
              aria-label="Скинути до одного"
              data-testid="bench-pad-clear"
            >
              C
            </button>
          ) : (
            <button
              key={key}
              type="button"
              disabled={idle}
              onClick={() => onDigit(Number(key))}
              className={keyClass}
              data-testid={`bench-pad-${key}`}
            >
              {key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
