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
      <div className="flex gap-1 p-0.5 bg-[#F5F5F5] rounded-[4px]">
        {options.map(([m, caption]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={`flex-1 px-2 py-1 text-xs rounded-[4px] ${
              mode === m ? 'bg-white font-medium shadow-sm' : 'text-[#6E6E6E]'
            }`}
          >
            {caption}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#6E6E6E]">{packHint(value, mode, pack, unit)}</p>
    </div>
  );
}
