// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill itself: rounds already in the kitchen's hands, oldest first, and
// under them the draft — what the waiter has tapped but not sent — with the
// two sums named apart and the one button that changes the world (К4f, §3.2).
// One component for both places it lives: the column beside the menu on a
// wide screen, and the sheet that slides up over it on a narrow one.

import { formatUah } from '@pos/platform';
import { canCancelRound, firedLineCents, lineTitle, ROUND_STATUS } from '../lib/bill';
import type { DraftLineView, DraftSummary } from '../lib/draft';
import type { Bill, BillLine } from '../lib/types';
import { Pencil } from '@pos/platform/ui';

export interface BillPaneProps {
  bill: Bill;
  draft: DraftLineView[];
  summary: DraftSummary;
  /** What the rounds locked — the money. */
  owedCents: number;
  busy: boolean;
  online: boolean;
  /** Some tap is still waiting for the server: nothing that fires may run. */
  hasPending: boolean;
  canPay: boolean;
  canPrecheck: boolean;
  printStatus: string | null;
  onLess: (line: DraftLineView) => void;
  onMore: (line: DraftLineView) => void;
  /** The row itself is the way into the sheet — answers, note, size (К4m). */
  onEdit: (line: DraftLineView) => void;
  onCancelRound: (roundId: number) => void;
  onFire: () => void;
  onPay: () => void;
  onPrecheck: () => void;
}

export function BillPane({
  bill,
  draft,
  summary,
  owedCents,
  busy,
  online,
  hasPending,
  canPay,
  canPrecheck,
  printStatus,
  onLess,
  onMore,
  onEdit,
  onCancelRound,
  onFire,
  onPay,
  onPrecheck,
}: BillPaneProps): JSX.Element {
  const firedLine = (l: BillLine): JSX.Element => (
    <div key={l.id} className="flex items-start justify-between gap-3 py-2" data-testid={`bill-line-${l.id}`}>
      <div className="min-w-0">
        <p className="truncate">
          <span className="tabular-nums">{l.quantity}×</span> {lineTitle(l, true)}
        </p>
        {l.note && <p className="text-xs italic text-sq-muted"><Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{l.note}</p>}
      </div>
      <span className="shrink-0 tabular-nums">{formatUah(firedLineCents(l))}</span>
    </div>
  );

  const draftLine = (row: DraftLineView): JSX.Element => {
    const title = row.modifierNames.length
      ? `${row.product_name}${row.variant_label ? ` · ${row.variant_label}` : ''} · ${row.modifierNames.join(' · ')}`
      : `${row.product_name}${row.variant_label ? ` · ${row.variant_label}` : ''}`;
    // A row the server has not answered yet has no id to count up or down;
    // the tile keeps taking taps meanwhile, and that is how one adds more.
    const editable = row.id != null && !row.pending;
    return (
      <div
        key={row.key}
        className={`flex items-start justify-between gap-3 py-2 ${row.pending ? 'opacity-60' : ''}`}
        data-testid={row.id != null ? `bill-line-${row.id}` : 'bill-line-pending'}
        data-pending={row.pending ? 'yes' : 'no'}
      >
        <div className="min-w-0">
          <button
            type="button"
            className="block w-full truncate text-left"
            data-testid={row.id != null ? `bill-line-edit-${row.id}` : undefined}
            disabled={busy || !online || !editable}
            onClick={() => onEdit(row)}
          >
            <span className="tabular-nums">{row.quantity}×</span> {title}
          </button>
          {row.note && <p className="text-xs italic text-sq-muted"><Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{row.note}</p>}
          {row.id != null && (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                className="sq-btn-tile"
                data-testid={`bill-less-${row.id}`}
                disabled={busy || !online || !editable}
                onClick={() => onLess(row)}
              >
                −
              </button>
              <button
                type="button"
                className="sq-btn-tile"
                data-testid={`bill-more-${row.id}`}
                disabled={busy || !online || !editable}
                onClick={() => onMore(row)}
              >
                +
              </button>
            </div>
          )}
        </div>
        <span className="shrink-0 tabular-nums">
          {row.preview_unit_cents == null ? '—' : `≈ ${formatUah(row.preview_unit_cents * row.quantity)}`}
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="bill-pane">
      <div className="flex-1 overflow-auto p-3">
        {bill.rounds.map((round) => (
          <section
            key={round.id}
            className="sq-card mb-3 p-3"
            data-testid={`bill-round-${round.id}`}
            data-cancelled={round.cancelled_at ? 'yes' : 'no'}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="sq-section-label">
                Раунд {round.seq} · {round.cancelled_at ? 'скасовано' : ROUND_STATUS[round.prep_status]}
              </p>
              <span className="tabular-nums">{round.cancelled_at ? '—' : formatUah(round.total_cents)}</span>
            </div>
            {round.items.map(firedLine)}
            {canCancelRound(round) && (
              <button
                type="button"
                className="sq-link mt-1"
                data-testid={`bill-cancel-round-${round.id}`}
                disabled={busy || !online || hasPending}
                onClick={() => onCancelRound(round.id)}
              >
                Скасувати раунд
              </button>
            )}
          </section>
        ))}

        <section className="sq-card p-3" data-testid="bill-draft">
          <p className="sq-section-label">Чернетка</p>
          {draft.length === 0 ? (
            <p className="py-2 text-sm text-sq-muted">Нічого не набрано — тапніть страву в меню</p>
          ) : (
            draft.map(draftLine)
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-sq-divider p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-sq-muted">До сплати</span>
          <span className="text-2xl font-bold tabular-nums" data-testid="bill-owed">
            {formatUah(owedCents)}
          </span>
        </div>
        {draft.length > 0 && (
          <div className="flex items-baseline justify-between text-sm text-sq-muted">
            <span>Чернетка (ще не відправлено)</span>
            <span className="tabular-nums" data-testid="bill-draft-total">
              {summary.exact ? '' : '≈ '}
              {formatUah(summary.cents)}
            </span>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="sq-btn-primary flex-1"
            data-testid="bill-fire"
            disabled={busy || !online || hasPending || draft.length === 0}
            onClick={onFire}
          >
            На кухню{summary.lines > 0 ? ` · ${summary.lines}` : ''}
          </button>
          <button
            type="button"
            className="sq-btn-primary flex-1"
            data-testid="bill-pay"
            // The draft is the server's own rule, said here before it has to
            // refuse: a plate the kitchen does not know about is not owed for.
            disabled={busy || !online || hasPending || !canPay || draft.length > 0}
            onClick={onPay}
          >
            Оплатити
          </button>
        </div>
        <button
          type="button"
          className="sq-link mt-2"
          data-testid="bill-precheck"
          disabled={busy || !online || hasPending || !canPrecheck}
          onClick={onPrecheck}
        >
          {bill.precheck_printed_at ? 'Передчек надруковано · ще раз' : 'Передчек'}
        </button>
        {printStatus && (
          <p className="mt-1 text-xs text-sq-muted" data-testid="bill-print-status">
            {printStatus}
          </p>
        )}
      </footer>
    </div>
  );
}
