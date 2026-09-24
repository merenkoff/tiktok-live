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
 * It is also why there is no `0` key — setting a count to zero is what the bin
 * button is for, and a key that silently deletes a row is a worse trade than
 * one missing digit.
 *
 * Keys are 1..9 and ⌫ over two rows, so each stays above the 44 px the same
 * section demands (WCAG 2.5.5 Enhanced), even in the 22 rem till panel.
 */

import { Delete } from '@pos/platform/ui';

interface Props {
  /** What the digits will land on — shown so the florist can see the target. */
  targetName: string | null;
  onDigit: (digit: number) => void;
  onBackspace: () => void;
}

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function QuantityPad({ targetName, onDigit, onBackspace }: Props) {
  const idle = targetName == null;

  return (
    <div className="px-3 py-2 border-t border-sq-divider bg-white" data-testid="bench-pad">
      <p className="text-xs text-sq-muted mb-1.5 truncate h-4">
        {idle ? 'Торкніться квітки, щоб набрати кількість' : `Кількість: ${targetName}`}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={idle}
            onClick={() => onDigit(digit)}
            className="min-h-11 rounded-sq border border-sq-divider bg-white text-base font-semibold text-sq-text disabled:opacity-40"
            data-testid={`bench-pad-${digit}`}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={idle}
          onClick={onBackspace}
          className="min-h-11 rounded-sq border border-sq-divider bg-white grid place-items-center text-sq-secondary disabled:opacity-40"
          aria-label="Стерти цифру"
          data-testid="bench-pad-backspace"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
