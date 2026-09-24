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
        <ul ref={listRef} className="flex-1 overflow-auto divide-y divide-sq-divider select-none">
          {stems.map((stem) => (
            <li
              key={stem.item.variant_id}
              ref={stem.item.variant_id === selectedId ? selectedRef : undefined}
              // A left accent rather than a filled row: the panel sits on a
              // grey sidebar on the till and on a white sheet on a tablet, so a
              // background that reads as "selected" in one reads as "not" in
              // the other. An edge marker reads the same on both.
              className={`px-4 py-3 border-l-4 ${
                stem.item.variant_id === selectedId ? 'border-sq-blue' : 'border-transparent'
              }`}
              data-testid="bench-stem"
              data-selected={stem.item.variant_id === selectedId ? 'true' : undefined}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-sq-text truncate">{stem.item.product_name}</p>
                <p className="text-sm font-medium text-sq-text tabular-nums shrink-0">
                  {formatUah(stem.item.price_cents * stem.quantity)}
                </p>
              </div>
              {stem.item.label && (
                <p className="text-xs text-sq-secondary truncate mt-0.5">{stem.item.label}</p>
              )}

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStep(stem.item.variant_id, -1)}
                  className="min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white"
                  aria-label={`Менше: ${stem.item.product_name}`}
                >
                  <Minus size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(stem.item.variant_id)}
                  className={`min-h-11 min-w-12 rounded-sq text-center text-base font-semibold tabular-nums ${
                    stem.item.variant_id === selectedId
                      ? 'text-sq-blue ring-2 ring-sq-blue'
                      : 'text-sq-text'
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
                  className="min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white disabled:opacity-40"
                  aria-label={`Більше: ${stem.item.product_name}`}
                >
                  <Plus size={20} />
                </button>
                <span className="text-xs text-sq-muted ml-1 truncate">
                  {stem.item.quantity} {stem.item.unit} на полиці
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(stem.item.variant_id)}
                  className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-muted hover:text-red-600 ml-auto shrink-0"
                  aria-label={`Прибрати: ${stem.item.product_name}`}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-sq-divider px-4 py-3 space-y-1.5 bg-white shrink-0">
        <Row label="Квіти" valueCents={totals.partsCents} />
        {labourBps > 0 && (
          <Row label={`Робота (${formatBps(labourBps)})`} valueCents={totals.labourCents} />
        )}
        <div className="flex items-baseline justify-between gap-3 pt-1.5 border-t border-sq-divider">
          <span className="font-semibold text-sq-text">Разом</span>
          <span
            className="text-xl font-semibold text-sq-text tabular-nums"
            data-testid="bench-total"
          >
            {formatUah(totals.totalCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, valueCents }: { label: string; valueCents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-sq-secondary">{label}</span>
      <span className="text-sm text-sq-text tabular-nums">{formatUah(valueCents)}</span>
    </div>
  );
}

/** 2500 → «25%», 1250 → «12,5%». The owner set it in percent; show it back. */
function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1).replace('.', ',')}%`;
}
