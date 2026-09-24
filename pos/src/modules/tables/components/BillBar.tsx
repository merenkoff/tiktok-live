// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bar pinned under the menu on a narrow screen (К4l, §3.2): what the draft
// comes to, and «На кухню» within a thumb's reach — the same taps as on a wide
// screen, so the speed budget (§6) holds in portrait. Tapping the figures
// opens the bill as a sheet; nothing on the bar is money.

import { formatUah } from '@pos/platform';
import type { DraftSummary } from '../lib/draft';

interface Props {
  summary: DraftSummary;
  owedCents: number;
  /** Something is still on its way to the server. */
  hasPending: boolean;
  busy: boolean;
  online: boolean;
  onOpen: () => void;
  onFire: () => void;
}

export function BillBar({ summary, owedCents, hasPending, busy, online, onOpen, onFire }: Props): JSX.Element {
  const hasDraft = summary.lines > 0;
  return (
    <div
      className="flex shrink-0 items-stretch gap-2 border-t border-sq-divider bg-sq-surface p-2"
      data-testid="bill-bar"
    >
      <button
        type="button"
        className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-sq px-2 text-left"
        data-testid="bill-bar-open"
        onClick={onOpen}
      >
        {hasDraft ? (
          <>
            <span className="truncate text-sm font-semibold">
              Чернетка · {summary.lines} поз.
              {hasPending ? ' · зберігаємо…' : ''}
            </span>
            <span className="text-xs text-sq-muted tabular-nums">
              {summary.exact ? '' : '≈ '}
              {formatUah(summary.cents)} · до сплати {formatUah(owedCents)}
            </span>
          </>
        ) : (
          <>
            <span className="truncate text-sm font-semibold">До сплати {formatUah(owedCents)}</span>
            <span className="text-xs text-sq-muted">Рахунок</span>
          </>
        )}
      </button>
      <button
        type="button"
        className="sq-btn-primary min-h-12 px-4"
        data-testid="bill-bar-fire"
        disabled={busy || !online || hasPending || !hasDraft}
        onClick={onFire}
      >
        На кухню{hasDraft ? ` · ${summary.lines}` : ''}
      </button>
    </div>
  );
}
