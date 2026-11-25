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

import { useEffect, useRef, useState } from 'react';
import { X } from '@pos/platform/ui';
import type { TrackedOrder } from './trackerApi';
import {
  STAGES,
  clockOf,
  itemsLine,
  minutesLate,
  nextStep,
  numberOf,
  receiptOf,
  stageOf,
  waitingTooLong,
} from './lib';
import { useCafeOrders } from './useCafeOrders';
import { hasTicketPrinter, printGuestTicket, type TicketOutcome } from '../ticket/guestTicket';
import { onTicketFailure } from '../ticket/notices';

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
 * How often the tracker looks again whether this device has a printer for the
 * ticket. It hangs over every till screen, «Обладнання» included, and is never
 * mounted afresh: a printer picked there must bring «Талон» without a restart.
 */
export const TICKET_PRINTER_RECHECK_MS = 30_000;

/** A failed ticket, kept with the order it was for. */
interface TicketError {
  orderId: number;
  text: string;
}

/**
 * «Талон» on a row: the guest's ticket again, when this device has a printer
 * for it (the till that sold prints it once by itself). Null without one.
 * The printer is looked for again while orders show, and once more at the
 * tap; a tap that finds none says so and takes the button away.
 */
function useTicketReprint(
  check: () => Promise<boolean>,
  print: (order: TrackedOrder) => Promise<TicketOutcome>,
  active: boolean
): {
  reprint: ((order: TrackedOrder) => Promise<string | null>) | null;
  printing: ReadonlySet<number>;
} {
  const [can, setCan] = useState(false);
  const [printing, setPrinting] = useState<ReadonlySet<number>>(() => new Set());
  const inFlight = useRef(new Set<number>());
  useEffect(() => {
    let alive = true;
    const look = () =>
      void check().then(
        (yes) => {
          if (alive) setCan(yes);
        },
        () => undefined
      );
    look();
    const id = active ? setInterval(look, TICKET_PRINTER_RECHECK_MS) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [check, active]);
  if (!can) return { reprint: null, printing };
  return {
    printing,
    reprint: async (order) => {
      // One ticket per tap: a second tap while the printer starts prints nothing.
      if (inFlight.current.has(order.id)) return null;
      inFlight.current.add(order.id);
      setPrinting(new Set(inFlight.current));
      try {
        let outcome: TicketOutcome;
        try {
          outcome = await print(order);
        } catch (e) {
          outcome = { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
        }
        if (outcome.kind === 'none') {
          setCan(false);
          return 'Немає принтера для талона — оберіть його на «Обладнанні».';
        }
        return outcome.kind === 'failed' ? `Талон не надруковано: ${outcome.error}` : null;
      } finally {
        inFlight.current.delete(order.id);
        setPrinting(new Set(inFlight.current));
      }
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
  const { reprint, printing } = useTicketReprint(ticketPrinter, printTicket, orders.length > 0);
  const [ticketError, setTicketError] = useState<TicketError | null>(null);
  // The ticket the till printed by itself after the sale did not come out.
  useEffect(
    () =>
      onTicketFailure(({ orderId, error }) => setTicketError({ orderId, text: `Талон не надруковано: ${error}` })),
    []
  );
  useHalfMinuteTick(orders.length > 0);
  if (orders.length === 0 && !banner) return null;
  const now = Date.now() + offset;
  // An error is about one order, and only while that order is on the list:
  // it must not come back over the next order an hour later.
  const errorOrder = ticketError ? orders.find((o) => o.id === ticketError.orderId) : undefined;
  const ticketLine =
    ticketError && errorOrder ? `${title(errorOrder) || errorOrder.kitchen_title} · ${ticketError.text}` : null;

  return (
    <section
      className="mx-3 my-2 rounded-2xl bg-white shadow-card px-4 py-3 space-y-2"
      data-testid="remote-tracker"
      aria-label="Замовлення з кухні"
    >
      <h2 className="text-[15px] font-bold text-sq-heading">Замовлення з кухні · {orders.length}</h2>
      {ticketLine && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-700" data-testid="remote-tracker-ticket-error">
          <span>{ticketLine}</span>
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
                  ? () =>
                      void reprint(order).then((error) =>
                        // A ticket that came out answers its own order's error, not another's.
                        setTicketError((prev) =>
                          error ? { orderId: order.id, text: error } : prev?.orderId === order.id ? null : prev
                        )
                      )
                  : undefined
              }
              ticketBusy={printing.has(order.id)}
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

/** «П-12 · Стіл 3 · чек R-000123 — » — what the cashier finds the receipt by in «Чеки». */
function cancelHead(order: TrackedOrder): string {
  const head = [title(order), receiptOf(order)].filter(Boolean).join(' · ');
  return head ? `${head} — ` : '';
}

function CancelRow({ order, busy, onSeen }: { order: TrackedOrder; busy: boolean; onSeen: () => void }) {
  return (
    <li
      className="rounded-xl bg-red-50 shadow-[0_0_0_2px_rgb(220,38,38)] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      data-testid={`remote-tracker-cancel-${order.id}`}
    >
      <div className="flex-1 min-w-[12rem]">
        <p className="text-[15px] font-bold text-red-700">
          {cancelHead(order)}скасовано кухнею — поверніть гостю
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
  ticketBusy = false,
}: {
  order: TrackedOrder;
  now: number;
  busy: boolean;
  onStep: (action: 'arrived' | 'handed') => void;
  onTicket?: () => void;
  /** The ticket is printing: a second tap would print a second one. */
  ticketBusy?: boolean;
}) {
  const stage = stageOf(order.status);
  const late = minutesLate(order, now);
  const step = nextStep(order, now);
  const delayed = order.delayed_minutes ?? 0;
  // A step the kitchen never marked asks first, inline: `window.confirm` does
  // nothing in the desktop webview.
  const [asking, setAsking] = useState(false);

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
        {asking && step?.confirm && (
          <p className="text-[13px] font-semibold text-sq-warning" data-testid={`remote-tracker-confirm-${order.id}`}>
            {step.confirm}
          </p>
        )}
      </div>
      {onTicket && (
        <button
          type="button"
          className="min-h-11 px-3 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text disabled:opacity-60"
          onClick={onTicket}
          disabled={ticketBusy}
          data-testid={`remote-tracker-ticket-${order.id}`}
        >
          Талон
        </button>
      )}
      {step && asking && step.confirm ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-11 px-3 rounded-xl bg-sq-blue hover:bg-sq-blue-press text-[15px] font-semibold text-white disabled:opacity-60"
            onClick={() => {
              setAsking(false);
              onStep(step.action);
            }}
            disabled={busy}
            data-testid={`remote-tracker-confirm-yes-${order.id}`}
          >
            Так, привезли
          </button>
          <button
            type="button"
            className="min-h-11 px-3 rounded-xl bg-white text-[15px] font-semibold text-sq-heading shadow-card"
            onClick={() => setAsking(false)}
          >
            Ні
          </button>
        </div>
      ) : step ? (
        <button
          type="button"
          className="min-h-11 px-3 rounded-xl bg-sq-blue hover:bg-sq-blue-press text-[15px] font-semibold text-white disabled:opacity-60"
          onClick={() => (step.confirm ? setAsking(true) : onStep(step.action))}
          disabled={busy}
          data-testid={`remote-tracker-step-${order.id}`}
        >
          {step.label}
        </button>
      ) : null}
    </li>
  );
}
