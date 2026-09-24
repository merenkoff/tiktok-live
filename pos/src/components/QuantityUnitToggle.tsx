// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { packHint, type Pack, type PackMode } from '../lib/pack';

/**
 * The «упаковки / базові» switch that sits on top of a quantity box, plus the
 * line under it saying what the typed number actually means (migration 054).
 *
 * Renders NOTHING without a pack. That is the whole rule for a shop that does
 * not buy in packs: no toggle, no hint, the screen looks exactly as it did.
 *
 * It never converts anything itself — the screen owns the number and calls
 * `quantityToBase` before sending. Keeping the arithmetic out of the component
 * is what lets one screen type in packs while sending base units without this
 * ever knowing which document it is on.
 */
export function QuantityUnitToggle({
  pack,
  unit,
  mode,
  value,
  onModeChange,
  className = '',
}: {
  /** `packOf(row)` — null means this variant has no pack. */
  pack: Pack | null;
  /** The variant's base unit, the other side of the switch. */
  unit: string;
  mode: PackMode;
  /** What is currently in the box, for the hint. */
  value: number;
  onModeChange: (next: PackMode) => void;
  className?: string;
}) {
  if (!pack) return null;

  const options: Array<[PackMode, string]> = [
    ['pack', pack.label],
    ['base', unit || 'одиниці'],
  ];

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Things' segmented control, small: a grey track, the chosen side a white chip. */}
      <div className="flex gap-0.5 p-[2px] bg-sq-empty rounded-[8px]">
        {options.map(([m, caption]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={`flex-1 min-h-7 px-2 text-[13px] rounded-[6px] transition-colors ${
              mode === m
                ? 'bg-white font-semibold text-sq-text shadow-[0_1px_3px_rgba(0,0,0,.12)]'
                : 'font-medium text-sq-secondary hover:text-sq-text'
            }`}
          >
            {caption}
          </button>
        ))}
      </div>
      <p className="text-xs text-sq-muted">{packHint(value, mode, pack, unit)}</p>
    </div>
  );
}
