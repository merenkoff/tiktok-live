// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Замовлення з кухні» (РК5, TechDocs/POS_REMOTE_KITCHEN.md §8): the cafe's
// paid kitchen orders over every till screen — «Готується → Їде → Привезли →
// Видали», the promised time and how late it runs, and the cafe's two taps.
// An order the KITCHEN cancelled is a red line until a cashier says the guest
// got the money back: without it the cafe learns of the cancel only if the
// kitchen phones.
//
// It draws NOTHING while no order is paid and on its way, and in a store that
// is not a cafe of some kitchen it does not even poll (`useCafeOrders`).

import { useEffect, useState } from 'react';
import { X } from '@pos/platform/ui';
import type { TrackedOrder } from './trackerApi';
import {
  STAGES,
  clockOf,
  itemsLine,
  minutesLate,
  nextStep,
  numberOf,
  stageOf,
  waitingTooLong,
} from './lib';
import { useCafeOrders } from './useCafeOrders';
import { hasTicketPrinter, printGuestTicket, type TicketOutcome } from '../ticket/guestTicket';

/** A tick every half minute while something shows: «запізнюється» moves on by itself. */
function useHalfMinuteTick(active: boolean): void {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);
}

/**
 * «Талон» on a row: the guest's ticket again, when this device has a printer
 * for it (the till that sold prints it once by itself). Null without one.
 */
function useTicketReprint(
  check: () => Promise<boolean>,
  print: (order: TrackedOrder) => Promise<TicketOutcome>
): { reprint: ((order: TrackedOrder) => Promise<string | null>) | null } {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let alive = true;
    void check().then((yes) => {
      if (alive) setCan(yes);
    });
    return () => {
      alive = false;
    };
  }, [check]);
  if (!can) return { reprint: null };
  return {
    reprint: async (order) => {
      const outcome = await print(order);
      return outcome.kind === 'failed' ? `Талон не надруковано: ${outcome.error}` : null;
    },
  };
}

export function CafeTracker({
  hook = useCafeOrders,
  ticketPrinter = hasTicketPrinter,
  printTicket = printGuestTicket,
}: {
  hook?: () => ReturnType<typeof useCafeOrders>;
  ticketPrinter?: () => Promise<boolean>;
  printTicket?: (order: TrackedOrder) => Promise<TicketOutcome>;
} = {}) {
  const { orders, offset, banner, busy, act, clearBanner } = hook();
  const { reprint } = useTicketReprint(ticketPrinter, printTicket);
  const [ticketError, setTicketError] = useState<string | null>(null);
  useHalfMinuteTick(orders.length > 0);
  if (orders.length === 0 && !banner) return null;
  const now = Date.now() + offset;

  return (
    <section
      className="mx-3 my-2 rounded-2xl bg-white shadow-card px-4 py-3 space-y-2"
      data-testid="remote-tracker"
      aria-label="Замовлення з кухні"
    >
      <h2 className="text-[15px] font-bold text-sq-heading">Замовлення з кухні · {orders.length}</h2>
      {ticketError && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-700" data-testid="remote-tracker-ticket-error">
          <span>{ticketError}</span>
          <button type="button" className="min-h-11 px-2" onClick={() => setTicketError(null)} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>
      )}
      {banner && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-700" data-testid="remote-tracker-banner">
          <span>{banner}</span>
          <button type="button" className="min-h-11 px-2" onClick={clearBanner} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {orders.map((order) =>
          order.status === 'cancelled' ? (
            <CancelRow
              key={order.id}
              order={order}
              busy={busy.has(order.id)}
              onSeen={() => void act(order, 'cancel-seen')}
            />
          ) : (
            <OrderRow
              key={order.id}
              order={order}
              now={now}
              busy={busy.has(order.id)}
              onStep={(action) => void act(order, action)}
              onTicket={
                reprint && order.order_no != null
                  ? () => void reprint(order).then((error) => setTicketError(error))
                  : undefined
              }
            />
          )
        )}
      </ul>
    </section>
  );
}

function title(order: TrackedOrder): string {
  return [numberOf(order), order.guest_label].filter(Boolean).join(' · ');
}

function CancelRow({ order, busy, onSeen }: { order: TrackedOrder; busy: boolean; onSeen: () => void }) {
  return (
    <li
      className="rounded-xl bg-red-50 shadow-[0_0_0_2px_rgb(220,38,38)] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      data-testid={`remote-tracker-cancel-${order.id}`}
    >
      <div className="flex-1 min-w-[12rem]">
        <p className="text-[15px] font-bold text-red-700">
          {title(order) ? `${title(order)} — ` : ''}скасовано кухнею — поверніть гостю
        </p>
        <p className="text-sm text-sq-secondary">
          {itemsLine(order)}
          {order.decline_reason ? ` · ${order.decline_reason}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="min-h-11 px-3 rounded-xl bg-sq-danger text-[15px] font-semibold text-white disabled:opacity-60"
        onClick={onSeen}
        disabled={busy}
        data-testid={`remote-tracker-seen-${order.id}`}
      >
        Гостю повернули
      </button>
    </li>
  );
}

function OrderRow({
  order,
  now,
  busy,
  onStep,
  onTicket,
}: {
  order: TrackedOrder;
  now: number;
  busy: boolean;
  onStep: (action: 'arrived' | 'handed') => void;
  onTicket?: () => void;
}) {
  const stage = stageOf(order.status);
  const late = minutesLate(order, now);
  const step = nextStep(order.status);
  const delayed = order.delayed_minutes ?? 0;

  return (
    <li className="rounded-xl bg-sq-empty px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`remote-tracker-${order.id}`}>
      <div className="flex-1 min-w-[12rem] space-y-1">
        <p className="text-[15px]">
          <span className="font-bold">{title(order) || order.kitchen_title}</span>
          <span className="text-sq-secondary"> · {itemsLine(order)}</span>
        </p>
        <ol className="flex flex-wrap items-center gap-1 text-[13px]" aria-label="Де замовлення">
          {STAGES.map((name, i) => (
            <li
              key={name}
              aria-current={i === stage ? 'step' : undefined}
              className={
                i === stage
                  ? 'rounded-full bg-sq-blue px-2 py-0.5 font-semibold text-white'
                  : i < stage
                    ? 'px-1 text-sq-secondary'
                    : 'px-1 text-sq-muted'
              }
            >
              {i === 0 && order.status === 'ready' ? 'Готово' : name}
            </li>
          ))}
        </ol>
        <p className="text-[13px]" data-testid={`remote-tracker-time-${order.id}`}>
          {order.status !== 'arrived' && order.promised_at && (
            <span className="text-sq-secondary">буде до {clockOf(order.promised_at)}</span>
          )}
          {late > 0 ? (
            <span className="font-semibold text-sq-danger"> · запізнюється на {late} хв</span>
          ) : delayed > 0 && order.status !== 'arrived' ? (
            <span className="font-semibold text-sq-warning"> · кухня додала {delayed} хв</span>
          ) : null}
          {waitingTooLong(order, now) && (
            <span className="font-semibold text-sq-warning">Привезли о {clockOf(order.arrived_at)} — гість ще не забрав</span>
          )}
        </p>
      </div>
      {onTicket && (
        <button
          type="button"
          className="min-h-11 px-3 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text"
          onClick={onTicket}
          data-testid={`remote-tracker-ticket-${order.id}`}
        >
          Талон
        </button>
      )}
      {step && (
        <button
          type="button"
          className="min-h-11 px-3 rounded-xl bg-sq-blue hover:bg-sq-blue-press text-[15px] font-semibold text-white disabled:opacity-60"
          onClick={() => onStep(step.action)}
          disabled={busy}
          data-testid={`remote-tracker-step-${order.id}`}
        >
          {step.label}
        </button>
      )}
    </li>
  );
}
