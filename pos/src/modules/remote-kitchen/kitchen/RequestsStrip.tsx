// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Запити з точок» (РК3, TechDocs/POS_REMOTE_KITCHEN.md §7.2): a linked cafe
// asked how long its order will take; the cook answers with one tap on the
// suggested time, nudges it by five, or says «Не зможемо».
//
// This module's `till.Banner`: the host's till frame draws it over every
// screen — the kitchen's board above all, which is the café vertical's page
// and carries none of this code. So it draws NOTHING while nothing waits, and
// in a store that is not a kitchen it does not even poll (`useRemoteRequests`).

import { useEffect, useState } from 'react';
import type { RemoteRequest } from './remoteApi';
import { STEP_MIN, clampPrep, defaultPrep, formatWait, guestMinutes, secondsToAnswer } from './lib';
import { chime, useRemoteRequests } from './useRemoteRequests';
import { Check, X } from '@pos/platform/ui';

const DECLINE_REASON = 'Кухня зараз не встигає';

/** A tick a second while a countdown shows, none otherwise. */
function useSecondTick(active: boolean): void {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function RequestsStrip({ hook = useRemoteRequests }: { hook?: typeof useRemoteRequests } = {}) {
  const { requests, offset, banner, busy, answer, decline, clearBanner } = hook(chime);
  useSecondTick(requests.length > 0);
  if (requests.length === 0 && !banner) return null;

  return (
    <section
      className="mx-3 my-2 rounded-2xl bg-amber-50 shadow-[0_0_0_2px_rgb(245,158,11)] px-4 py-3 space-y-3"
      data-testid="remote-requests"
      aria-label="Запити з точок"
    >
      <h2 className="text-[15px] font-bold text-amber-800">Запити з точок · {requests.length}</h2>
      {banner && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-700" data-testid="remote-banner">
          <span>{banner}</span>
          <button type="button" className="min-h-11 px-2" onClick={clearBanner} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {requests.map((order) => (
          <RequestCard
            key={`${order.id}-${order.revision}`}
            order={order}
            offset={offset}
            busy={busy.has(order.id)}
            onAnswer={(minutes) => void answer(order, minutes)}
            onDecline={() => void decline(order, DECLINE_REASON)}
          />
        ))}
      </div>
    </section>
  );
}

/** What the till frame draws (`till.Banner` takes no props). */
export default function RemoteKitchenBanner() {
  return <RequestsStrip />;
}

function RequestCard({
  order,
  offset,
  busy,
  onAnswer,
  onDecline,
}: {
  order: RemoteRequest;
  offset: number;
  busy: boolean;
  onAnswer: (minutes: number) => void;
  onDecline: () => void;
}) {
  // Keyed on the revision by the caller: the cafe changed the cart, and the
  // cook starts again from the kitchen's numbers.
  const [prep, setPrep] = useState(() => defaultPrep(order));
  const left = secondsToAnswer(order.answer_deadline_at, offset);

  return (
    <article className="rounded-xl bg-white px-3 py-3 shadow-card flex flex-col gap-2" data-testid={`remote-request-${order.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-bold text-sq-heading">
          {order.cafe_name}
          {order.guest_label ? <span className="text-sq-secondary font-normal"> · {order.guest_label}</span> : null}
        </p>
        {left != null && (
          <span
            className={`text-sm font-bold tabular-nums ${left <= 15 ? 'text-sq-danger' : 'text-sq-secondary'}`}
            data-testid="remote-left"
          >
            {left > 0 ? formatWait(left) : 'кафе вже дзвонить'}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-0.5 text-base">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-bold tabular-nums">{item.quantity}×</span> {item.product_name}
            {item.variant_label && <span className="text-sq-secondary"> {item.variant_label}</span>}
            {item.note && <span className="font-semibold text-sq-warning"> · {item.note}</span>}
          </li>
        ))}
      </ul>
      {order.note && <p className="text-sm text-sq-secondary">Замовлення: {order.note}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-h-12 w-12 rounded-xl bg-sq-empty text-lg font-bold"
          onClick={() => setPrep((m) => clampPrep(m - STEP_MIN))}
          aria-label="На 5 хвилин менше"
          disabled={busy}
        >
          −5
        </button>
        <div className="flex-1 text-center">
          <p className="text-2xl font-bold tabular-nums" data-testid="remote-prep">
            {prep} хв
          </p>
          <p className="text-xs text-sq-muted">гостю: {guestMinutes(prep, order.transit_minutes)} хв з дорогою</p>
        </div>
        <button
          type="button"
          className="min-h-12 w-12 rounded-xl bg-sq-empty text-lg font-bold"
          onClick={() => setPrep((m) => clampPrep(m + STEP_MIN))}
          aria-label="На 5 хвилин більше"
          disabled={busy}
        >
          +5
        </button>
      </div>
      <button
        type="button"
        className="w-full min-h-12 rounded-xl bg-sq-blue hover:bg-sq-blue-press text-[17px] font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
        onClick={() => onAnswer(prep)}
        disabled={busy}
        data-testid={`remote-answer-${order.id}`}
      >
        <Check size={20} aria-hidden />
        Встигнемо за {prep} хв
      </button>
      <button
        type="button"
        className="w-full min-h-11 rounded-xl text-[15px] font-semibold text-sq-danger disabled:opacity-60"
        onClick={onDecline}
        disabled={busy}
        data-testid={`remote-decline-${order.id}`}
      >
        Не зможемо
      </button>
    </article>
  );
}
