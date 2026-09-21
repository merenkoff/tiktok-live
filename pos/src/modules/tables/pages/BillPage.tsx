// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill of one table (phase К4f, TechDocs/POS_TABLES.md §3.2).
//
// Read top to bottom the way the evening happened: the rounds already in the
// kitchen's hands, oldest first, and under them the draft — what the waiter
// has typed but not sent. The one thing this screen must never blur is which
// of the two is money:
//
//   «До сплати» is what the rounds LOCKED when they fired. Real.
//   «Чернетка»  is what the untyped half would come to TODAY. Not owed.
//
// Adding them into one figure would be the very thing §4.3 forbids — a bill
// that quietly reprices itself mid-dinner. So they are two lines, named apart,
// and the draft one carries «≈» whenever any of its lines cannot be priced yet.
//
// «На кухню» is the only button that changes the world: it locks the prices,
// moves the stock and puts the ticket on the pass. It carries a `client_uuid`
// so a second tap on a bad connection is the same round, not dinner twice.

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  formatUah,
  getMeta,
  printPrecheck,
  useAuthStore,
  useOfflineStatus,
  usePosShell,
} from '@pos/platform';
import type { ReceiptPaperWidth } from '@pos/platform';
import { DishPicker } from '../components/DishPicker';
import { PaySheet } from '../components/PaySheet';
import { billTotals, canCancelRound, firedLineCents, lineTitle, ROUND_STATUS } from '../lib/bill';
import { isSettled, payableLines } from '../lib/pay';
import { buildPrecheck } from '../lib/precheck';
import { useBill } from '../lib/useBill';
import * as tablesApi from '../lib/tablesApi';
import type { PayPart } from '../lib/tablesApi';
import type { BillLine } from '../lib/types';

function newUuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Only a very old webview lands here; the value still has to look like one,
  // because the server validates the shape before it dedupes on it.
  return '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12);
}

export function BillPage(): JSX.Element {
  const { billId } = useParams<{ billId: string }>();
  const id = Number(billId);
  const online = useOfflineStatus((s) => s.online);
  const shell = usePosShell();
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const { bill, loading, error, banner, busy, stale, savedAt, clearBanner, reload, run } = useBill(
    id,
    // The till keeps a copy so a blink of the Wi-Fi does not take the bill off
    // the screen mid-dinner; the waiter's web tablet has no offline runtime to
    // read one back (§4.12).
    { online, mirrored: shell === 'cashier', storeId }
  );
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  const totals = useMemo(() => (bill ? billTotals(bill) : null), [bill]);
  const owedLines = useMemo(() => (bill ? payableLines(bill) : []), [bill]);

  // Offline with nothing remembered. With a mirror the bill is drawn below
  // instead — readable, marked as a memory, and with every write refused.
  if (!online && !stale && !loading) {
    return (
      <div className="p-4" data-testid="bill-offline">
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">
            Рахунок живе на сервері — без звʼязку його не змінити.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <p className="p-6 text-center text-sm text-sq-muted">Завантаження…</p>;

  if (error || !bill) {
    return (
      <div className="p-4">
        <div className="sq-card p-6 text-center">
          <p className="text-sm">{error ?? 'Рахунок не знайдено'}</p>
          <button type="button" className="sq-btn-primary mt-3" onClick={() => void reload()}>
            Повторити
          </button>
        </div>
      </div>
    );
  }

  /**
   * Pay, then leave if the table is settled.
   *
   * Whether it IS settled is read off the bill the server answered with, not
   * guessed from what was sent: a part may fail after an earlier one was
   * rung, and the lines still without a `sale_id` are the only honest answer
   * to «що лишилось».
   */
  const pay = async (parts: PayPart[]): Promise<void> => {
    let settled = false;
    const ok = await run(async () => {
      const paid = await tablesApi.payBill(bill.id, parts);
      settled = isSettled(paid.bill);
      return paid.bill;
    });
    if (!ok) return;
    setPaying(false);
    if (settled) navigate('/tables');
  };

  /**
   * The pre-bill: mark it on the server, and on a till also print it.
   *
   * The mark is the part that matters to everyone else — it is what the
   * table's tile shows, so the next waiter does not read the sum out twice —
   * so it is recorded first and never held up by paper. The waiter's tablet
   * is the web shell and has no printer at all; there the mark IS the whole
   * action, and К4h's Rust command simply never runs.
   */
  const precheck = async (): Promise<void> => {
    setPrintStatus(null);
    const ok = await run(() => tablesApi.markPrecheck(bill.id));
    if (!ok || shell !== 'cashier') return;
    try {
      const [name, mm] = await Promise.all([
        getMeta<string>('receiptPrinterName'),
        getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
      ]);
      if (!name) return; // a till with no thermal printer configured
      await printPrecheck(
        name,
        buildPrecheck(bill),
        mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH
      );
      setPrintStatus('Передчек надіслано на друк');
    } catch (err) {
      setPrintStatus(err instanceof Error ? err.message : 'Не вдалося надрукувати');
    }
  };

  const line = (l: BillLine, fired: boolean): JSX.Element => (
    <div
      key={l.id}
      className="flex items-start justify-between gap-3 py-2"
      data-testid={`bill-line-${l.id}`}
    >
      <div className="min-w-0">
        <p className="truncate">
          <span className="tabular-nums">{l.quantity}×</span> {lineTitle(l, fired)}
        </p>
        {l.note && <p className="text-xs italic text-sq-muted">✎ {l.note}</p>}
        {!fired && (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className="sq-btn-tile"
              data-testid={`bill-less-${l.id}`}
              disabled={busy || !online}
              onClick={() =>
                void run(() =>
                  l.quantity > 1
                    ? tablesApi.setQuantity(bill.id, l.id, l.quantity - 1)
                    : tablesApi.removeLine(bill.id, l.id)
                )
              }
            >
              −
            </button>
            <button
              type="button"
              className="sq-btn-tile"
              data-testid={`bill-more-${l.id}`}
              disabled={busy || !online}
              onClick={() => void run(() => tablesApi.setQuantity(bill.id, l.id, l.quantity + 1))}
            >
              +
            </button>
          </div>
        )}
      </div>
      <span className="shrink-0 tabular-nums">
        {fired
          ? formatUah(firedLineCents(l))
          : l.preview_unit_price_cents == null
            ? '—'
            : `≈ ${formatUah(l.preview_unit_price_cents * l.quantity)}`}
      </span>
    </div>
  );

  return (
    <div className="relative flex h-full flex-col" data-testid="bill-page">
      <header className="flex items-baseline justify-between gap-2 border-b border-sq-divider p-3">
        <div>
          <p className="text-xl font-bold">Стіл {bill.table_name}</p>
          <p className="text-xs text-sq-muted">
            {bill.hall_name} · рахунок {bill.bill_no} · {bill.guests} гост. ·{' '}
            {bill.opened_by_name}
          </p>
        </div>
        <button type="button" className="sq-link" onClick={() => navigate('/tables')}>
          До зали
        </button>
      </header>

      {stale && (
        <p className="m-3 rounded-lg bg-amber-500/15 p-2 text-sm" data-testid="bill-stale">
          Немає звʼязку — рахунок з памʼяті каси
          {savedAt == null
            ? ''
            : `, станом на ${String(new Date(savedAt).getHours()).padStart(2, '0')}:${String(
                new Date(savedAt).getMinutes()
              ).padStart(2, '0')}`}
          . Змінити його можна лише онлайн.
        </p>
      )}

      {banner && (
        <p className="m-3 rounded-lg bg-rose-500/15 p-2 text-sm" data-testid="bill-banner">
          {banner}{' '}
          <button type="button" className="sq-link" onClick={clearBanner}>
            Зрозуміло
          </button>
        </p>
      )}

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
                Раунд {round.seq} ·{' '}
                {round.cancelled_at ? 'скасовано' : ROUND_STATUS[round.prep_status]}
              </p>
              <span className="tabular-nums">
                {round.cancelled_at ? '—' : formatUah(round.total_cents)}
              </span>
            </div>
            {round.items.map((l) => line(l, true))}
            {canCancelRound(round) && (
              <button
                type="button"
                className="sq-link mt-1"
                data-testid={`bill-cancel-round-${round.id}`}
                disabled={busy}
                onClick={() => void run(() => tablesApi.cancelRound(bill.id, round.id))}
              >
                Скасувати раунд
              </button>
            )}
          </section>
        ))}

        <section className="sq-card p-3" data-testid="bill-draft">
          <div className="flex items-baseline justify-between gap-2">
            <p className="sq-section-label">Чернетка</p>
            <button
              type="button"
              className="sq-link"
              data-testid="bill-add"
              disabled={busy || !online}
              onClick={() => setPicking(true)}
            >
              + Додати
            </button>
          </div>
          {bill.draft.length === 0 ? (
            <p className="py-2 text-sm text-sq-muted">Нічого не набрано</p>
          ) : (
            bill.draft.map((l) => line(l, false))
          )}
        </section>
      </div>

      <footer className="border-t border-sq-divider p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-sq-muted">До сплати</span>
          <span className="text-2xl font-bold tabular-nums" data-testid="bill-owed">
            {formatUah(totals!.owed)}
          </span>
        </div>
        {bill.draft.length > 0 && (
          <div className="flex items-baseline justify-between text-sm text-sq-muted">
            <span>Чернетка (ще не відправлено)</span>
            <span className="tabular-nums" data-testid="bill-draft-total">
              {totals!.draftExact ? '' : '≈ '}
              {formatUah(totals!.draft)}
            </span>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="sq-btn-primary flex-1"
            data-testid="bill-fire"
            disabled={busy || !online || bill.draft.length === 0}
            onClick={() => void run(() => tablesApi.fireRound(bill.id, newUuid()))}
          >
            На кухню
          </button>
          <button
            type="button"
            className="sq-btn-primary flex-1"
            data-testid="bill-pay"
            // The draft is the server's own rule, said here before it has to
            // refuse: a plate the kitchen does not know about is not owed for.
            disabled={busy || !online || owedLines.length === 0 || bill.draft.length > 0}
            onClick={() => setPaying(true)}
          >
            Оплатити
          </button>
        </div>
        <button
          type="button"
          className="sq-link mt-2"
          data-testid="bill-precheck"
          disabled={busy || !online || owedLines.length === 0}
          onClick={() => void precheck()}
        >
          {bill.precheck_printed_at ? 'Передчек надруковано · ще раз' : 'Передчек'}
        </button>
        {printStatus && (
          <p className="mt-1 text-xs text-sq-muted" data-testid="bill-print-status">
            {printStatus}
          </p>
        )}
      </footer>

      {paying && (
        <PaySheet bill={bill} busy={busy} onClose={() => setPaying(false)} onPay={(p) => void pay(p)} />
      )}

      {picking && (
        <DishPicker
          busy={busy}
          draftCount={bill.draft.length}
          onClose={() => setPicking(false)}
          onPick={({ item, modifiers, note }) => {
            void run(() =>
              tablesApi.addLine(bill.id, {
                variant_id: item.variant_id,
                quantity: 1,
                modifiers,
                note,
              })
            );
          }}
        />
      )}
    </div>
  );
}
