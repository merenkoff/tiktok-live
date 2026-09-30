// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What guests have asked for from the QR menu, waiting for a waiter (phase
// Q7, TechDocs/POS_QR_MENU.md §Q6–Q7).
//
// One card per request, on two screens: the hall map lists every table's (a
// free table has no bill to open, so the map is where its request is answered)
// and the bill screen lists that table's own. Nothing on a card has reached
// the bill, the stock or the kitchen — accepting is what makes it real, and
// the card says what accepting will do before the waiter taps it.
//
// The button is honest about what it leaves out. A dish stopped since the
// guest tapped it, or one the server refuses at the moment of accepting, is
// struck through and the button becomes «Прийняти без цієї»: a waiter who
// taps «Прийняти» and finds a dish missing from the bill has been lied to by
// the button, and the guest is standing there.

import { useEffect, useRef, useState } from 'react';
import { Bell, X } from '@pos/platform/ui';
import { acceptLabel, blockedLineIds, REJECT_REASONS, waitingLabel } from '../lib/guestOrders';
import type { GuestOrder } from '../lib/types';
import { useVisiblePoll } from '../lib/usePolling';

/** What an accept came to, as far as the card needs to know. */
export interface AcceptOutcome {
  ok: boolean;
  /** The request line the server refused, when it named one. */
  refusedLineId?: number | null;
}

export interface GuestOrdersPanelProps {
  orders: readonly GuestOrder[];
  /** Name the table on each card — the map lists the whole room's, the bill screen is already at one. */
  showTable: boolean;
  /** A write is in flight somewhere: nothing here may start another. */
  busy: boolean;
  onAccept: (order: GuestOrder, excludeLineIds: number[]) => Promise<AcceptOutcome>;
  onReject: (order: GuestOrder, reason: string | null) => Promise<boolean>;
}

export function GuestOrdersPanel({ orders, showTable, busy, onAccept, onReject }: GuestOrdersPanelProps): JSX.Element | null {
  // Lines the server refused at the moment of accepting, per request.
  const [refused, setRefused] = useState<Record<number, number[]>>({});
  const [rejecting, setRejecting] = useState<number | null>(null);
  // The age on each card moves on its own, not only when a poll finds news.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useVisiblePoll(() => setNowMs(Date.now()), orders.length > 0, 15000);
  // The list sits in a box of limited height (both screens cap it, so a busy
  // evening does not push the room off the map), and the reasons open BELOW
  // the buttons: without scrolling the card into view the second reason is
  // out of sight and the waiter has to find the scroll before they can answer.
  const cards = useRef(new Map<number, HTMLElement>());
  useEffect(() => {
    if (rejecting != null) cards.current.get(rejecting)?.scrollIntoView?.({ block: 'nearest' });
  }, [rejecting]);

  if (orders.length === 0) return null;

  async function accept(order: GuestOrder): Promise<void> {
    const skipped = refused[order.id] ?? [];
    const outcome = await onAccept(order, blockedLineIds(order, new Set(skipped)));
    if (!outcome.ok && outcome.refusedLineId != null) {
      const lineId = outcome.refusedLineId;
      setRefused((prev) => ({ ...prev, [order.id]: [...(prev[order.id] ?? []), lineId] }));
    }
  }

  async function reject(order: GuestOrder, reason: string | null): Promise<void> {
    const ok = await onReject(order, reason);
    if (ok) setRejecting(null);
  }

  return (
    <div className="space-y-2.5" data-testid="guest-orders-panel">
      {orders.map((order) => {
        const skipped = new Set(refused[order.id] ?? []);
        const label = acceptLabel(order, skipped);
        return (
          <section
            key={order.id}
            ref={(el) => {
              if (el) cards.current.set(order.id, el);
              else cards.current.delete(order.id);
            }}
            className="rounded-2xl bg-white ring-2 ring-sq-blue px-4 py-3"
            data-testid={`guest-order-${order.id}`}
            data-table={order.table_id}
          >
            <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
              <Bell size={22} className="text-sq-blue" />
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading">
                {showTable ? `Стіл ${order.table_name}${order.hall_name ? ` · ${order.hall_name}` : ''}` : 'Гість просить'}
              </p>
              <span className="shrink-0 text-[13px] text-sq-muted tabular-nums">
                {waitingLabel(order.created_at, nowMs)}
              </span>
            </div>

            <div className="pt-1">
              {order.lines.map((line) => {
                const blocked = line.problem != null || skipped.has(line.id);
                const sub = [line.caption, line.note ? `«${line.note}»` : ''].filter(Boolean).join(' · ');
                return (
                  <div
                    key={line.id}
                    className="flex items-start gap-2.5 py-1.5"
                    data-testid={`guest-line-${line.id}`}
                    data-blocked={blocked ? 'yes' : 'no'}
                  >
                    <span className="w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums">
                      {line.quantity}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[15px] ${blocked ? 'text-sq-muted line-through' : 'text-sq-text'}`}>{line.name}</p>
                      {sub && <p className="text-[13px] text-sq-muted">{sub}</p>}
                      {blocked && (
                        <p className="text-[13px] font-semibold text-sq-danger">
                          {line.problem ?? 'не вдалося додати — див. повідомлення вище'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="pt-1 text-[13px] text-sq-muted">
              {order.has_open_bill ? 'Додасться до рахунку столу' : 'Відкриється рахунок столу'} — на кухню піде після
              вашого «Прийняти»
            </p>

            {rejecting === order.id ? (
              <div className="pt-2.5 space-y-1.5" data-testid={`guest-order-reasons-${order.id}`}>
                <p className="text-[13px] font-semibold text-sq-secondary">Що прочитає гість:</p>
                {REJECT_REASONS.map((reason, i) => (
                  <button
                    key={reason}
                    type="button"
                    className={reasonClass}
                    data-testid={`guest-order-reason-${order.id}-${i}`}
                    disabled={busy}
                    onClick={() => void reject(order, reason)}
                  >
                    {reason}
                  </button>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${reasonClass} flex-1`}
                    data-testid={`guest-order-reason-none-${order.id}`}
                    disabled={busy}
                    onClick={() => void reject(order, null)}
                  >
                    Без причини
                  </button>
                  <button
                    type="button"
                    className={`${reasonClass} flex-1 text-sq-blue`}
                    onClick={() => setRejecting(null)}
                  >
                    Назад
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5 pt-2.5">
                <button
                  type="button"
                  className="min-h-[48px] w-14 shrink-0 rounded-xl bg-white ring-1 ring-sq-divider text-sq-danger grid place-items-center disabled:opacity-40"
                  aria-label="Відхилити"
                  data-testid={`guest-order-reject-${order.id}`}
                  disabled={busy}
                  onClick={() => setRejecting(order.id)}
                >
                  <X size={22} />
                </button>
                {label != null ? (
                  <button
                    type="button"
                    className="pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]"
                    data-testid={`guest-order-accept-${order.id}`}
                    disabled={busy}
                    onClick={() => void accept(order)}
                  >
                    {label}
                  </button>
                ) : (
                  <p className="flex-1 self-center text-[13px] text-sq-muted" data-testid={`guest-order-none-${order.id}`}>
                    Жодну страву зараз не прийняти — відхиліть запит
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const reasonClass =
  'w-full min-h-[44px] rounded-xl bg-white ring-1 ring-sq-divider px-3 text-left text-[15px] text-sq-text disabled:opacity-40';
