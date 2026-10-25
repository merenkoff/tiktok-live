// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Під запис» beside «Оплатити» — the host's `checkout.Action` slot (Г2).
//
// The goods leave with the customer and the shop writes them to the customer's
// tab: no money, no fiscal receipt (scheme A, TechDocs/grocery/G3_DEBTS.md).
// The receipt comes when the customer pays the debt off.
//
// What the button says before anyone taps is decided by `issueBlock`: no
// customer, no network, a bouquet assembled at the counter, a customer the
// owner gave no limit, a locked one, and a cart above what is still allowed
// (decision Д3 — the till does not let it through and says so in figures). The
// server checks every one of them again under the customer's lock.
//
// The key of the write (`client_uuid`) is made when the sheet opens and kept
// until it closes. A tap that timed out is then a replay on the second tap, not
// a second debt for the same bread — and so is the tap in a sheet opened again
// on the same cart for the same customer (`pendingKeys`). While such a write is
// unanswered the limit does not stop the check: if the write did land, the
// balance already holds it, and «over the limit» would be that very write.
//
// The desktop till (PR3, G3_DEBTS.md §6) writes without a network. There the
// handover is judged by the till's mirror of limits — Д3 still holds — and
// goes into the module's queue under the sheet's key, to reach the server when
// the network is back. A write that got no answer goes into the same queue
// under the same key: if it did land, sending it again is a replay, so the
// cashier never has to choose between a lost debt and a double one. Online,
// the till's catalogue is asked to re-read the stock the server just moved.
// And on every handover a desktop with a printer for «Квитанції під запис»
// prints the customer's slip; without one, nothing is printed.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  api,
  cartLineCents,
  cashierApi,
  computeCartDiscountCents,
  formatUah,
  isOfflinePosEnabled,
  useAuthStore,
  useOfflineStatus,
} from '@pos/platform';
import { Wallet } from '@pos/platform/ui';
import type { CheckoutActionProps } from '../../types';
import type { IssueRow } from '../data/db';
import { enqueueIssue } from '../data/queue';
import { withPending } from '../lib/creditStore';
import { debtsApi } from '../lib/debtsApi';
import { creditLine, issueBlock, issueItems, lineTitle, plural } from '../lib/debt';
import { debtFailure, unansweredFailure, type DebtFailure } from '../lib/errors';
import { issueScope, rememberUnanswered, settle, unansweredKey } from '../lib/pendingKeys';
import {
  buildIssueSlip,
  printIssueSlip,
  slipLinesFromServer,
  type IssueSlipInput,
  type SlipLine,
  type SlipOutcome,
} from '../lib/slip';
import { publishCredit, useCredit } from '../lib/useCredit';
import type { DebtCredit, DebtWriteResult } from '../lib/types';
import { Sheet } from './Sheet';

const NOTE_MAX = 200;

/** What still stops a write that may already have landed: nothing to check it with or against. */
const HARD_BLOCKS = new Set(['no_customer', 'offline', 'no_mirror', 'assembled']);

const NO_ANSWER = 'Немає відповіді від сервера — запис міг пройти. «Перевірити ще раз» не запише борг удруге.';
const EARLIER_NO_ANSWER =
  'Попередній запис цього кошика лишився без відповіді — він міг пройти. «Перевірити ще раз» не запише борг удруге.';

type Done =
  | { kind: 'server'; result: DebtWriteResult }
  /** Written down at the till; `after` is the debt it comes to, by the till's own reckoning. */
  | { kind: 'queued'; row: IssueRow; after: DebtCredit | null };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function slipText(slip: SlipOutcome | null): string | null {
  if (!slip || slip.kind === 'none') return null;
  if (slip.kind === 'printed') return `Квитанцію надруковано (${slip.printer})`;
  return `Квитанцію не надруковано: ${slip.error}`;
}

export default function CheckoutAction({ lines, customer, cartDiscount, totalCents, onCompleted }: CheckoutActionProps) {
  const online = useOfflineStatus((s) => s.online);
  const auth = useAuthStore((s) => s.auth);
  const queue = isOfflinePosEnabled();
  // An offline login holds no token the server would take — as good as no network.
  const reachable = online && (!queue || api.hasLiveJwt());
  const customerId = customer?.id ?? null;
  const { credit, local, unknown, pending, reload } = useCredit(customerId);
  const items = useMemo(() => issueItems(lines), [lines]);
  const scope = customerId != null ? issueScope(customerId, items, cartDiscount) : null;

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DebtFailure | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [slip, setSlip] = useState<SlipOutcome | null>(null);
  // Which sheet a slip belongs to: a print that finishes after the sheet closed tells no one.
  const sheet = useRef(0);
  const lastSlip = useRef<IssueSlipInput | null>(null);

  // Closing the success pane IS «готово»: the host empties the cart and
  // re-reads stock. Any way out of it counts, or a cashier who taps the
  // backdrop would be left with a cart that is already on the tab.
  const close = useCallback(() => {
    const finished = done != null;
    sheet.current += 1;
    lastSlip.current = null;
    setOpen(false);
    setKey(null);
    setNote('');
    setFailure(null);
    setDone(null);
    setSlip(null);
    if (finished) onCompleted();
  }, [done, onCompleted]);

  if (lines.length === 0 && !open) return null;

  const pendingKey = scope != null ? unansweredKey(scope) : null;
  const judged = issueBlock({
    customerId,
    credit,
    totalCents,
    lines,
    online: reachable,
    queue,
    noMirror: queue && !reachable && unknown,
  });
  const block = judged && pendingKey != null && !HARD_BLOCKS.has(judged.code) ? null : judged;
  // Without a network the till must have read its mirror before it lets goods go.
  const waiting = !reachable && queue && credit == null && block == null;

  function start() {
    const replay = scope != null ? unansweredKey(scope) : null;
    sheet.current += 1;
    setKey(replay ?? crypto.randomUUID());
    setFailure(replay ? unansweredFailure(EARLIER_NO_ANSWER) : null);
    setDone(null);
    setSlip(null);
    setOpen(true);
    reload();
  }

  async function printFor(input: Omit<IssueSlipInput, 'storeName' | 'staffName' | 'customer' | 'note'>) {
    if (!queue || !customer) return;
    const full: IssueSlipInput = {
      ...input,
      storeName: auth?.store.name ?? '',
      staffName: auth?.staff.display_name ?? '',
      customer: { name: customer.name, phone: customer.phone },
      note: note.trim() || null,
    };
    lastSlip.current = full;
    const mine = sheet.current;
    const outcome = await printIssueSlip(buildIssueSlip(full));
    if (sheet.current === mine) setSlip(outcome);
  }

  async function reprint() {
    const input = lastSlip.current;
    if (!input) return;
    const mine = sheet.current;
    const outcome = await printIssueSlip(buildIssueSlip(input));
    if (sheet.current === mine) setSlip(outcome);
  }

  /** The handover goes into the desktop's queue under the sheet's key. */
  async function writeDown(afterTimeout: boolean) {
    if (!customer || customerId == null || scope == null || key == null || !auth) return;
    const discountCents = computeCartDiscountCents(lines, cartDiscount);
    const slipLines: SlipLine[] = lines.map((line) => ({
      title: lineTitle(line),
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unit_price_cents,
      // The server's own sum: grams × price per kilogram on a weighed line.
      totalCents: cartLineCents(line),
      pricePer: line.price_per ?? 1,
    }));
    let row: IssueRow;
    try {
      row = await enqueueIssue({
        id: key,
        storeId: auth.store.id,
        staff: { id: auth.staff.id, name: auth.staff.display_name },
        customer: { id: customerId, name: customer.name, phone: customer.phone },
        items,
        cartDiscount,
        note: note.trim() || null,
        totalCents,
        discountCents,
        lines: slipLines,
      });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (afterTimeout) {
        // The server may have it; the same key on the next tap finds out.
        rememberUnanswered(scope, key);
        setFailure(unansweredFailure(`${NO_ANSWER} Записати на касі теж не вдалося: ${why}`));
      } else {
        setFailure({ ...unansweredFailure(`Не вдалося записати на касі: ${why}`), unknown: false });
      }
      return;
    }
    settle(scope);
    // `credit` already counts what this till wrote down before; this handover goes on top.
    const after = credit ? withPending(credit, row.totalCents) : null;
    void useOfflineStatus.getState().refreshPending();
    setDone({ kind: 'queued', row, after });
    void printFor({
      entryId: null,
      at: new Date(row.createdAt),
      lines: slipLines,
      discountCents,
      totalCents: row.totalCents,
      balanceAfterCents: after?.balance_cents ?? null,
    });
  }

  async function issue() {
    if (customerId == null || scope == null || key == null || busy || waiting) return;
    setBusy(true);
    setFailure(null);
    try {
      if (queue && !reachable) {
        await writeDown(false);
        return;
      }
      try {
        const result = await debtsApi.issue({
          customer_id: customerId,
          items,
          cart_discount: cartDiscount,
          client_uuid: key,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        settle(scope);
        publishCredit(result.credit, customer ?? undefined);
        // The server moved the stock; the desktop's catalogue reads its own copy.
        if (queue) void cashierApi.refreshCatalog().catch(() => undefined);
        setDone({ kind: 'server', result });
        void printFor({
          entryId: result.entry.id,
          at: new Date(result.entry.created_at || Date.now()),
          lines: slipLinesFromServer(result.lines),
          discountCents: 0,
          totalCents: result.entry.amount_cents,
          balanceAfterCents: withPending(result.credit, pending.cents).balance_cents,
        });
      } catch (e) {
        const failed = debtFailure(e, 'Не вдалося записати під запис');
        if (failed.unknown && queue) {
          // No answer: it may have landed. Written down under the same key, it
          // is a replay when it goes again — never a second debt.
          await writeDown(true);
          return;
        }
        // An unknown outcome keeps the key — here and for a sheet opened again
        // on this cart — so the next tap replays rather than doubles. A definite
        // refusal frees it: the next tap is a new attempt.
        if (failed.unknown) {
          rememberUnanswered(scope, key);
          setFailure({ ...failed, text: NO_ANSWER });
        } else {
          settle(scope);
          setFailure(failed);
          setKey(crypto.randomUUID());
        }
        if (failed.code === 'over_limit' || failed.code === 'no_credit' || failed.code === 'credit_locked') reload();
      }
    } finally {
      setBusy(false);
    }
  }

  const balance = credit?.balance_cents ?? 0;
  const after = balance + totalCents;
  // Only why it cannot. What the customer owes and may still take is the
  // strip under their name one line up (`customer.Panel`), and saying it twice
  // would put two identical lines into a cart that has room for neither.
  const hint =
    block?.text ??
    (pendingKey != null
      ? 'Попередній запис цього кошика лишився без відповіді — відкрийте й перевірте'
      : !reachable && queue && credit
        ? 'Без мережі: запишеться на касі й піде на сервер, щойно зʼявиться звʼязок'
        : null);

  return (
    <>
      <div data-testid="debts-checkout-action">
        <button
          type="button"
          className="w-full min-h-[48px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          disabled={block != null}
          onClick={start}
        >
          <Wallet size={20} />
          Під запис
        </button>
        {hint && (
          <p
            className={`mt-1 text-[13px] leading-snug ${block?.code === 'over_limit' ? 'text-amber-800' : 'text-sq-muted'}`}
            data-testid="debts-checkout-hint"
          >
            {hint}
          </p>
        )}
      </div>

      {open && customer && (
        <Sheet title={done ? 'Записано під запис' : 'Під запис'} onClose={close} testId="debts-issue-sheet">
          {done ? (
            <div className="space-y-3">
              <p className="text-[15px]">
                <span className="font-semibold">{customer.name}</span> забирає товари на{' '}
                <span className="font-semibold tabular-nums">
                  {formatUah(done.kind === 'server' ? done.result.entry.amount_cents : done.row.totalCents)}
                </span>
                .
              </p>
              {done.kind === 'server' && done.result.replay && (
                <p className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-issue-replay">
                  Цей запис уже був зроблений о {timeOf(done.result.entry.created_at)} — удруге борг не записано.
                </p>
              )}
              {done.kind === 'queued' && (
                <p className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-issue-queued">
                  Записано на касі без мережі. На сервер піде, щойно зʼявиться звʼязок, — там ціни звірять ще раз.
                </p>
              )}
              {(done.kind === 'server' || done.after) && (
                <p className="text-[15px] tabular-nums" data-testid="debts-issue-after">
                  {creditLine(done.kind === 'server' ? withPending(done.result.credit, pending.cents) : done.after!)}
                </p>
              )}
              <p className="text-[13px] text-sq-muted">Фіскальний чек буде, коли покупець погасить борг.</p>
              {slipText(slip) && (
                <div className="flex items-center gap-3">
                  <p
                    className={`flex-1 text-[13px] ${slip?.kind === 'failed' ? 'text-amber-800' : 'text-sq-muted'}`}
                    data-testid="debts-issue-slip"
                  >
                    {slipText(slip)}
                  </p>
                  <button type="button" className="sq-btn-quiet min-h-[40px] shrink-0" onClick={() => void reprint()}>
                    Ще раз
                  </button>
                </div>
              )}
              <button type="button" className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]" onClick={close}>
                Готово
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-[17px] font-semibold">{customer.name}</p>
                {customer.phone && <p className="text-[13px] text-sq-muted">{customer.phone}</p>}
              </div>
              <dl className="space-y-1.5 text-[15px] tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">У кошику</dt>
                  <dd className="font-semibold">{formatUah(totalCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">Борг зараз</dt>
                  <dd>{credit ? formatUah(balance) : '…'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sq-secondary">Борг стане</dt>
                  <dd className="font-semibold">
                    {credit ? formatUah(after) : '…'}
                    {credit?.limit_cents != null && (
                      <span className="font-normal text-sq-muted"> з {formatUah(credit.limit_cents)}</span>
                    )}
                  </dd>
                </div>
              </dl>
              {local && credit && (
                <p className="text-[13px] text-sq-muted" data-testid="debts-issue-local">
                  Без мережі — за даними каси
                  {pending.count > 0
                    ? `, разом із ${pending.count} ${plural(pending.count, 'записом', 'записами', 'записами')}, що ще не на сервері`
                    : ''}
                  .
                </p>
              )}
              <label className="block">
                <span className="text-[13px] font-semibold text-sq-secondary">Примітка (необовʼязково)</span>
                <input
                  className="pos-field mt-1 w-full"
                  value={note}
                  maxLength={NOTE_MAX}
                  placeholder="Наприклад: до зарплати"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {(block || failure) && (
                <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="debts-issue-error">
                  {failure?.text ?? block?.text}
                </p>
              )}
              <button
                type="button"
                className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums"
                disabled={busy || block != null || waiting}
                onClick={() => void issue()}
              >
                {busy ? 'Записую…' : failure?.unknown ? 'Перевірити ще раз' : `Записати ${formatUah(totalCents)} у борг`}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
