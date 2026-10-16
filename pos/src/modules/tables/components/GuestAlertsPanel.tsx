// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What guests' phones say that is not a request for dishes (phases Q8/Q9,
// TechDocs/POS_QR_MENU.md «Q8 + Q9»): a call — «покличте офіціанта»,
// «принесіть рахунок» — and an order the owner let go straight to the kitchen.
//
// Above the requests, on both screens, because both are more urgent than a
// request: a call is a guest looking round the room, and an auto-sent order is
// already cooking — if nobody reads it, a dish comes out of the kitchen for a
// table no waiter knows about. That is also why the auto-sent card is loud
// (its own colour, its own glyph) and has one job: «Бачу».
//
// Neither card writes anything a guest sees beyond «Офіціант іде»; neither
// touches the bill. «Бачу» on an order that OPENED the bill gives the table to
// this waiter, and the card says so before the tap.

import { useState } from 'react';
import { formatUah } from '@pos/platform';
import { ChefHat, Receipt, User } from '@pos/platform/ui';
import { callWords, sentCaption, waitingLabel } from '../lib/guestOrders';
import type { SentGuestOrder, WaiterCall } from '../lib/types';
import { useVisiblePoll } from '../lib/usePolling';

export interface GuestAlertsPanelProps {
  calls: readonly WaiterCall[];
  sent: readonly SentGuestOrder[];
  /** Name the table on each card — the map lists the whole room's, the bill screen is already at one. */
  showTable: boolean;
  /** A write is in flight somewhere: nothing here may start another. */
  busy: boolean;
  onAnswer: (call: WaiterCall) => Promise<boolean>;
  onSeen: (order: SentGuestOrder) => Promise<boolean>;
  /** Open that table's bill. Absent on the bill screen, which is already there. */
  onOpenBill?: (billId: number) => void;
}

const CALL_TONE: Record<WaiterCall['kind'], string> = {
  waiter: 'ring-[#8A6CEF]',
  bill: 'ring-[#1B9DF0]',
};

export function GuestAlertsPanel({
  calls,
  sent,
  showTable,
  busy,
  onAnswer,
  onSeen,
  onOpenBill,
}: GuestAlertsPanelProps): JSX.Element | null {
  // A card stays disabled while its own tap is on the way, so a second tap
  // does not send a second «Іду».
  const [pending, setPending] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useVisiblePoll(() => setNowMs(Date.now()), calls.length + sent.length > 0, 15000);

  if (calls.length === 0 && sent.length === 0) return null;

  async function tap(key: string, act: () => Promise<boolean>): Promise<void> {
    if (pending) return;
    setPending(key);
    try {
      await act();
    } finally {
      setPending(null);
    }
  }

  const place = (tableName: string, hallName: string): string =>
    `Стіл ${tableName}${hallName ? ` · ${hallName}` : ''}`;

  return (
    <div className="space-y-2.5" data-testid="guest-alerts-panel">
      {calls.map((call) => {
        const key = `call:${call.id}`;
        return (
          <section
            key={key}
            className={`rounded-2xl bg-white ring-2 ${CALL_TONE[call.kind]} px-4 py-3`}
            data-testid={`guest-call-${call.id}`}
            data-kind={call.kind}
            data-table={call.table_id}
          >
            <div className="flex items-center gap-2.5">
              {call.kind === 'bill' ? <Receipt size={26} /> : <User size={26} />}
              <div className="min-w-0 flex-1">
                {/* Wraps, never truncates: on a phone «Стіл 2 · Просить р…» hid the very word that matters. */}
                <p className="break-words text-[16px] font-bold leading-snug text-sq-heading">
                  {showTable ? `Стіл ${call.table_name} · ` : ''}
                  {callWords(call.kind)}
                </p>
                <p className="text-[13px] text-sq-muted tabular-nums">
                  {[showTable ? call.hall_name : '', waitingLabel(call.created_at, nowMs), call.kind === 'bill' && !call.has_open_bill ? 'рахунку ще немає' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                className="pos-btn-primary min-h-[48px] shrink-0 rounded-xl px-5 text-[16px]"
                data-testid={`guest-call-answer-${call.id}`}
                disabled={busy || pending != null}
                onClick={() => void tap(key, () => onAnswer(call))}
              >
                Іду
              </button>
            </div>
          </section>
        );
      })}

      {sent.map((order) => {
        const key = `sent:${order.id}`;
        return (
          <section
            key={key}
            className="rounded-2xl bg-white ring-2 ring-[#F4891F] px-4 py-3"
            data-testid={`guest-sent-${order.id}`}
            data-table={order.table_id}
          >
            <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
              <ChefHat size={24} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-sq-heading">
                  {showTable ? place(order.table_name, order.hall_name) : 'Гість замовив сам'}
                </p>
                <p className="text-[13px] font-semibold text-[#B35F0C]">{sentCaption(order)}</p>
              </div>
              <span className="shrink-0 text-[13px] text-sq-muted tabular-nums">{waitingLabel(order.created_at, nowMs)}</span>
            </div>

            <div className="pt-1">
              {order.lines.map((line, i) => {
                const sub = [line.caption, line.note ? `«${line.note}»` : ''].filter(Boolean).join(' · ');
                return (
                  <div key={i} className="flex items-start gap-2.5 py-1">
                    <span className="w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums">
                      {line.quantity}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-sq-text">{line.name}</p>
                      {sub && <p className="text-[13px] text-sq-muted">{sub}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="pt-1 text-[13px] text-sq-muted">
              {order.bill_opened_by_guest
                ? 'Рахунок відкрив гість, стіл ще нічий — «Бачу» закріпить його за вами.'
                : 'Гість замовив з телефону, кухня вже готує.'}{' '}
              <span className="font-semibold text-sq-text tabular-nums">{formatUah(order.total_cents)}</span>
            </p>

            <div className="flex gap-2.5 pt-2.5">
              {onOpenBill && (
                <button
                  type="button"
                  className="min-h-[48px] flex-1 rounded-xl bg-white ring-1 ring-sq-divider px-3 text-[15px] font-semibold text-sq-blue disabled:opacity-40"
                  data-testid={`guest-sent-open-${order.id}`}
                  disabled={busy || pending != null}
                  onClick={() => onOpenBill(order.bill_id)}
                >
                  Відкрити рахунок
                </button>
              )}
              <button
                type="button"
                className="pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]"
                data-testid={`guest-sent-seen-${order.id}`}
                disabled={busy || pending != null}
                onClick={() => void tap(key, () => onSeen(order))}
              >
                Бачу
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
