// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What is in the bouquet right now, and what it costs.
 *
 * Two rules from the design doc show up here as code rather than as taste:
 *
 * - **Labour is its own line** (§3.3). Folding it into the stem prices would
 *   hide the one number an owner needs to see to know their margin survived
 *   the shift, and the florist needs to be able to say what the customer is
 *   paying for.
 * - **Taking a stem back is free and instant** (§3.7). No manager code, no
 *   confirm. Pulling a rose out is design work, not theft; the industry's
 *   habit of gating every line removal is what makes these screens hated.
 */

import { useEffect, useRef } from 'react';
import { Minus, Plus, Trash2 } from '@pos/platform/ui';
import { formatUah } from '@pos/platform';
import { useDragScroll } from '@pos/platform/ui';
import type { BenchStem, BenchTotals } from './useBench';

interface Props {
  stems: BenchStem[];
  totals: BenchTotals;
  labourBps: number;
  /** What the number pad types into — highlighted so the target is visible. */
  selectedId: number | null;
  onSelect: (variantId: number) => void;
  onStep: (variantId: number, delta: number) => void;
  onRemove: (variantId: number) => void;
}

export function CompositionPanel({
  stems,
  totals,
  labourBps,
  selectedId,
  onSelect,
  onStep,
  onRemove,
}: Props) {
  const listRef = useDragScroll<HTMLUListElement>();
  const selectedRef = useRef<HTMLLIElement>(null);

  // A stem added while the list is already long lands below the fold, and a
  // florist who taps a flower and sees nothing happen taps it again. Scroll to
  // whatever was just touched.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, stems.length]);

  return (
    <div className="flex flex-col min-h-0 flex-1" data-testid="bench-composition">
      {stems.length === 0 ? (
        <div className="flex-1 grid place-items-center p-6 text-center">
          <p className="text-sm text-sq-muted max-w-[22ch]">
            Торкніться квітки, щоб покласти її в букет
          </p>
        </div>
      ) : (
        <ul ref={listRef} className="flex-1 overflow-auto px-3 pb-2 space-y-2 select-none">
          {stems.map((stem) => {
            const selected = stem.item.variant_id === selectedId;
            return (
              <li
                key={stem.item.variant_id}
                ref={selected ? selectedRef : undefined}
                // The selected stem is lifted onto a white card — the number
                // pad types into it — rather than tinted, so it reads the same
                // on the grey till panel and on the tablet's sheet.
                className={`rounded-[14px] pl-3.5 pr-3 py-3 flex flex-col gap-2 transition-colors ${
                  selected ? 'bg-white shadow-card' : ''
                }`}
                data-testid="bench-stem"
                data-selected={selected ? 'true' : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-sq-text truncate">{stem.item.product_name}</p>
                    {stem.item.label && (
                      <p className="text-[13px] text-sq-muted truncate">{stem.item.label}</p>
                    )}
                  </div>
                  <p className="text-base font-semibold text-sq-text tabular-nums shrink-0">
                    {formatUah(stem.item.price_cents * stem.quantity)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onStep(stem.item.variant_id, -1)}
                    className={stepClass}
                    aria-label={`Менше: ${stem.item.product_name}`}
                  >
                    <Minus size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(stem.item.variant_id)}
                    className={`w-11 h-10 rounded-[10px] text-center text-[17px] font-semibold tabular-nums text-sq-text ${
                      selected ? 'bg-white ring-2 ring-sq-blue' : ''
                    }`}
                    aria-label={`Набрати кількість: ${stem.item.product_name}`}
                    data-testid="bench-stem-qty"
                  >
                    {stem.quantity}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStep(stem.item.variant_id, 1)}
                    disabled={stem.quantity >= stem.item.quantity}
                    className={stepClass}
                    aria-label={`Більше: ${stem.item.product_name}`}
                  >
                    <Plus size={20} />
                  </button>
                  <span className="text-[13px] text-sq-muted ml-1.5 truncate flex-1">
                    {stem.item.quantity} на полиці
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(stem.item.variant_id)}
                    className="w-10 h-10 grid place-items-center rounded-full text-sq-muted hover:text-red-600 shrink-0"
                    aria-label={`Прибрати: ${stem.item.product_name}`}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-3 px-2 pt-3 pb-2.5 space-y-1.5 shrink-0 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        <Row label="Квіти" valueCents={totals.partsCents} />
        {labourBps > 0 && (
          <Row label={`Робота флориста · ${formatBps(labourBps)}`} valueCents={totals.labourCents} />
        )}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px] font-bold text-sq-heading">Разом</span>
          <span
            className="text-[26px] font-bold text-sq-heading tabular-nums"
            data-testid="bench-total"
          >
            {formatUah(totals.totalCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

const stepClass =
  'w-10 h-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider text-sq-text disabled:opacity-40';

function Row({ label, valueCents }: { label: string; valueCents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[15px] text-sq-secondary">{label}</span>
      <span className="text-[15px] text-sq-secondary tabular-nums">{formatUah(valueCents)}</span>
    </div>
  );
}
/** 2500 → «25%», 1250 → «12,5%». The owner set it in percent; show it back. */
function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1).replace('.', ',')} %`;
}
