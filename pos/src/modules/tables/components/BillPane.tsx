// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill itself: rounds already in the kitchen's hands, oldest first, and
// under them the draft — what the waiter has tapped but not sent — with the
// two sums named apart and the one button that changes the world (К4f, §3.2).
// One component for both places it lives: the column beside the menu on a
// wide screen, and the sheet that slides up over it on a narrow one.

import { formatUah } from '@pos/platform';
import { canCancelRound, firedLineCents, ROUND_STATUS } from '../lib/bill';
import type { DraftLineView, DraftSummary } from '../lib/draft';
import type { Bill, BillLine, BillRound } from '../lib/types';
import { ChefHat, Minus, Pencil, Plus, Printer } from '@pos/platform/ui';

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
    <LineRow
      key={l.id}
      testId={`bill-line-${l.id}`}
      quantity={l.quantity}
      title={l.product_name}
      sub={[l.variant_label, l.note].filter(Boolean).join(' · ')}
      price={formatUah(firedLineCents(l))}
    />
  );

  const draftLine = (row: DraftLineView): JSX.Element => {
    const sub = [row.variant_label, ...row.modifierNames, row.note].filter(Boolean).join(' · ');
    // A row the server has not answered yet has no id to count up or down;
    // the tile keeps taking taps meanwhile, and that is how one adds more.
    const editable = row.id != null && !row.pending;
    return (
      <div
        key={row.key}
        className={`flex items-start gap-2.5 py-1.5 ${row.pending ? 'opacity-60' : ''}`}
        data-testid={row.id != null ? `bill-line-${row.id}` : 'bill-line-pending'}
        data-pending={row.pending ? 'yes' : 'no'}
      >
        <span className="w-7 pt-0.5 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums">
          {row.quantity}×
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block w-full text-left"
            data-testid={row.id != null ? `bill-line-edit-${row.id}` : undefined}
            disabled={busy || !online || !editable}
            onClick={() => onEdit(row)}
          >
            <span className="block text-[15px] text-sq-text truncate">{row.product_name}</span>
            {sub && <span className="block text-[13px] text-sq-muted truncate">{sub}</span>}
          </button>
          {row.id != null && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Менше"
                className={stepClass}
                data-testid={`bill-less-${row.id}`}
                disabled={busy || !online || !editable}
                onClick={() => onLess(row)}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                aria-label="Більше"
                className={stepClass}
                data-testid={`bill-more-${row.id}`}
                disabled={busy || !online || !editable}
                onClick={() => onMore(row)}
              >
                <Plus size={16} />
              </button>
            </div>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-[15px] text-sq-text tabular-nums">
          {row.preview_unit_cents == null ? '—' : formatUah(row.preview_unit_cents * row.quantity)}
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="bill-pane">
      <div className="flex-1 overflow-auto px-3.5 pt-3.5 pb-2 space-y-2.5">
        {bill.rounds.map((round) => {
          const cancelled = round.cancelled_at != null;
          return (
            <section
              key={round.id}
              className={`rounded-2xl bg-white shadow-card px-4 py-3 ${cancelled ? 'opacity-60' : ''}`}
              data-testid={`bill-round-${round.id}`}
              data-cancelled={cancelled ? 'yes' : 'no'}
            >
              <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
                <ChefHat size={24} />
                <p className="flex-1 text-[15px] font-bold text-sq-heading">
                  Раунд {round.seq}
                  {!cancelled && (
                    <span className="ml-2 font-normal text-[13px] text-sq-muted tabular-nums">
                      {formatUah(round.total_cents)}
                    </span>
                  )}
                </p>
                <span className={`text-[13px] font-semibold ${cancelled ? 'text-sq-muted' : ROUND_TONE[round.prep_status]}`}>
                  {cancelled
                    ? 'скасовано'
                    : round.prep_status === 'new'
                      ? `${ROUND_STATUS.new} · ${minutesSince(round.fired_at)} хв`
                      : ROUND_STATUS[round.prep_status]}
                </span>
              </div>
              <div className="pt-1">{round.items.map(firedLine)}</div>
              {canCancelRound(round) && (
                <button
                  type="button"
                  className="mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40"
                  data-testid={`bill-cancel-round-${round.id}`}
                  disabled={busy || !online || hasPending}
                  onClick={() => onCancelRound(round.id)}
                >
                  Скасувати раунд
                </button>
              )}
            </section>
          );
        })}

        <section
          className={`rounded-2xl bg-white px-4 py-3 ${draft.length > 0 ? 'ring-2 ring-sq-blue' : 'shadow-card'}`}
          data-testid="bill-draft"
        >
          <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
            <Pencil size={20} className="text-sq-blue" />
            <p className="flex-1 text-[15px] font-bold text-sq-heading">Чернетка</p>
            <span className="text-[13px] text-sq-muted">ще не на кухні</span>
          </div>
          {draft.length === 0 ? (
            <p className="py-2 text-sm text-sq-muted">Нічого не набрано — тапніть страву в меню</p>
          ) : (
            <div className="pt-1">{draft.map(draftLine)}</div>
          )}
        </section>
      </div>

      <footer className="shrink-0 px-4 pt-3.5 pb-4 space-y-2.5 shadow-[0_-1px_0_#E6E8EC]">
        {draft.length > 0 && (
          <div className="flex items-baseline justify-between text-sm text-sq-secondary">
            <span>Чернетка, за сьогоднішніми цінами</span>
            <span className="tabular-nums" data-testid="bill-draft-total">
              {summary.exact ? '' : '≈ '}
              {formatUah(summary.cents)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold text-sq-heading">До сплати</span>
          <span className="text-[26px] font-bold text-sq-heading tabular-nums" data-testid="bill-owed">
            {formatUah(owedCents)}
          </span>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-40"
            data-testid="bill-fire"
            disabled={busy || !online || hasPending || draft.length === 0}
            onClick={onFire}
          >
            <ChefHat size={24} />
            На кухню{summary.lines > 0 ? ` · ${summary.lines}` : ''}
          </button>
          <button
            type="button"
            className="pos-btn-primary flex-1 min-h-[52px] rounded-xl text-[17px]"
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
          className="w-full min-h-9 text-[15px] font-semibold text-sq-blue inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          data-testid="bill-precheck"
          disabled={busy || !online || hasPending || !canPrecheck}
          onClick={onPrecheck}
        >
          <Printer size={20} />
          {bill.precheck_printed_at ? 'Передчек надруковано · ще раз' : 'Передчек'}
        </button>
        {printStatus && (
          <p className="text-xs text-sq-muted text-center" data-testid="bill-print-status">
            {printStatus}
          </p>
        )}
      </footer>
    </div>
  );
}

const stepClass =
  'w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40';

const ROUND_TONE: Record<BillRound['prep_status'], string> = {
  new: 'text-[#D9730D]',
  ready: 'text-sq-success',
  served: 'text-sq-muted',
};

/** Whole minutes since the round was fired, on this device's clock; never negative. */
function minutesSince(at: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60_000));
}

/** One line of a fired round: «2×  Борщ / зі сметаною  330,00 ₴». */
function LineRow({
  testId,
  quantity,
  title,
  sub,
  price,
}: {
  testId: string;
  quantity: number;
  title: string;
  sub: string;
  price: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 py-1.5" data-testid={testId}>
      <span className="w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums">{quantity}×</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-sq-text truncate">{title}</p>
        {sub && <p className="text-[13px] text-sq-muted truncate">{sub}</p>}
      </div>
      <span className="shrink-0 text-[15px] text-sq-text tabular-nums">{price}</span>
    </div>
  );
}
