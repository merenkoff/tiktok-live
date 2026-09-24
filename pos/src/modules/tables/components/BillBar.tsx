// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The card pinned under the menu on a narrow screen (К4l, §3.2): the draft as
// it grows, what the table owes, and «На кухню» within a thumb's reach — the
// same taps as on a wide screen, so the speed budget (§6) holds in portrait.
// Tapping the card opens the whole bill as a sheet.

import { formatUah } from '@pos/platform';
import { ChefHat, Pencil } from '@pos/platform/ui';
import { ROUND_STATUS } from '../lib/bill';
import type { DraftLineView, DraftSummary } from '../lib/draft';
import { positionsLabel } from '../lib/hallMap';
import type { BillRound } from '../lib/types';

interface Props {
  draft: DraftLineView[];
  rounds: BillRound[];
  summary: DraftSummary;
  owedCents: number;
  /** Something is still on its way to the server. */
  hasPending: boolean;
  busy: boolean;
  online: boolean;
  onOpen: () => void;
  onFire: () => void;
}

/** How many draft rows the card shows before «ще N» — the menu keeps the rest of the screen. */
const SHOWN = 2;

export function BillBar({ draft, rounds, summary, owedCents, hasPending, busy, online, onOpen, onFire }: Props): JSX.Element {
  const hasDraft = summary.lines > 0;
  const cooking = [...rounds].reverse().find((r) => r.cancelled_at == null && r.prep_status !== 'served');
  return (
    <div
      className="shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4"
      data-testid="bill-bar"
    >
      <button type="button" className="block w-full text-left" data-testid="bill-bar-open" onClick={onOpen}>
        <span aria-hidden className="block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5" />
        <span className="flex items-center gap-2.5 pb-1">
          <Pencil size={20} className="text-sq-blue shrink-0" />
          <span className="flex-1 min-w-0 truncate text-base font-bold text-sq-heading">
            {hasDraft ? `Чернетка · ${positionsLabel(summary.lines)}` : 'Рахунок'}
            {hasPending ? ' · зберігаємо…' : ''}
          </span>
          {cooking && (
            <span className="shrink-0 text-sm text-sq-muted">
              Раунд {cooking.seq} {ROUND_STATUS[cooking.prep_status]}
            </span>
          )}
        </span>
        {draft.slice(0, SHOWN).map((row) => (
          <span key={row.key} className="flex items-start gap-2.5 py-1">
            <span className="w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums">{row.quantity}×</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-sq-text">{row.product_name}</span>
              {row.modifierNames.length > 0 && (
                <span className="block truncate text-[13px] text-sq-muted">{row.modifierNames.join(' · ')}</span>
              )}
            </span>
            <span className="shrink-0 text-[15px] text-sq-text tabular-nums">
              {row.preview_unit_cents == null ? '—' : formatUah(row.preview_unit_cents * row.quantity)}
            </span>
          </span>
        ))}
        {draft.length > SHOWN && (
          <span className="block py-0.5 text-[13px] text-sq-blue font-semibold">ще {draft.length - SHOWN}…</span>
        )}
      </button>
      <div className="flex items-center gap-3 pt-2.5 mt-1 shadow-[0_-1px_0_#E6E8EC]">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-sq-secondary">До сплати</p>
          <p className="text-2xl font-bold text-sq-heading tabular-nums">{formatUah(owedCents)}</p>
        </div>
        <button
          type="button"
          className="pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2"
          data-testid="bill-bar-fire"
          disabled={busy || !online || hasPending || !hasDraft}
          onClick={onFire}
        >
          <ChefHat size={24} />
          На кухню{hasDraft ? ` · ${summary.lines}` : ''}
        </button>
      </div>
    </div>
  );
}
