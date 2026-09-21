// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The two columns of the kitchen board and the card in each (К3c). One
// button per card, `min-h-14`: a cook's hands are wet and the tablet is a
// metre away.

import { useEffect, useReducer } from 'react';
import { formatWait, orderLabel, splitColumns, waitSeconds, waitTone } from './lib/kitchen';
import type { KitchenOrder, Station } from './types';
import { useKitchenOrders } from './useKitchenOrders';

const STATION_LABEL: Record<Station, string> = { kitchen: 'кухня', bar: 'бар' };

const TONE_CLASS = {
  ok: 'text-sq-secondary',
  warn: 'text-amber-600',
  late: 'text-red-600',
} as const;

export function OrdersTab() {
  const { orders, offset, loading, error, banner, markReady, markServed, clearBanner } =
    useKitchenOrders(true);
  // The waits tick once a second; the list itself comes every five.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { inWork, pickup } = splitColumns(orders);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
      {error && (
        <p className="text-sm text-red-600" data-testid="kitchen-error">
          {error}
        </p>
      )}
      {banner && (
        <div
          className="flex items-center justify-between gap-3 rounded-sq bg-amber-50 text-amber-800 px-3 py-2 text-sm"
          data-testid="kitchen-banner"
        >
          <span>{banner}</span>
          <button type="button" className="min-h-11 px-2 font-semibold" onClick={clearBanner} aria-label="Закрити">
            ×
          </button>
        </div>
      )}
      {loading && orders.length === 0 && <p className="text-sm text-sq-muted">Завантаження…</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <Column title="В роботі" testId="kitchen-in-work" empty="Замовлень немає">
          {inWork.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              since={order.created_at}
              offset={offset}
              action="Готово"
              actionTestId={`kitchen-ready-${order.id}`}
              onAction={() => void markReady(order.id)}
            />
          ))}
        </Column>
        <Column title="Видача" testId="kitchen-pickup" empty="Нічого не чекає видачі">
          {pickup.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              since={order.ready_at ?? order.created_at}
              offset={offset}
              action="Видано"
              actionTestId={`kitchen-served-${order.id}`}
              onAction={() => void markServed(order.id)}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  testId,
  empty,
  children,
}: {
  title: string;
  testId: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-sq-secondary uppercase tracking-wide px-1">
        {title}
      </h2>
      {children.length === 0 ? (
        <p className="rounded-sq border border-dashed border-sq-divider p-6 text-center text-sm text-sq-muted">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function OrderCard({
  order,
  since,
  offset,
  action,
  actionTestId,
  onAction,
}: {
  order: KitchenOrder;
  since: string;
  offset: number;
  action: string;
  actionTestId: string;
  onAction: () => void;
}) {
  const seconds = waitSeconds(since, offset);
  const stations = new Set<Station>();
  for (const item of order.items) for (const s of item.stations) stations.add(s);

  return (
    <article
      className="rounded-sq border border-sq-divider bg-white p-3 space-y-2 shadow-sm"
      data-testid={`kitchen-order-${order.id}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-6xl font-bold tabular-nums leading-none" data-testid="kitchen-order-no">
          {orderLabel(order)}
        </p>
        <div className="text-right">
          <p
            className={`text-xl font-semibold tabular-nums ${TONE_CLASS[waitTone(seconds)]}`}
            data-testid="kitchen-wait"
          >
            {formatWait(seconds)}
          </p>
          <p className="text-xs text-sq-secondary">{order.staff_name}</p>
        </div>
      </div>

      {stations.size > 0 && (
        <div className="flex gap-1.5">
          {[...stations].map((s) => (
            <span
              key={s}
              className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-sq-bg text-sq-secondary"
            >
              {STATION_LABEL[s]}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-1.5">
        {order.items.map((item) => (
          <li key={item.id} className="text-base leading-snug">
            <span className="font-semibold tabular-nums">{item.quantity} ×</span>{' '}
            <span className="font-medium">{item.product_name}</span>
            {item.variant_label && <span className="text-sq-secondary"> {item.variant_label}</span>}
            {item.modifiers.length > 0 && (
              <ul className="ml-6 text-sm text-sq-secondary">
                {item.modifiers.map((m, i) => (
                  <li key={`${m.group_name}-${i}`}>{m.name}</li>
                ))}
              </ul>
            )}
            {item.note && <p className="ml-6 text-sm italic text-sq-text">✎ {item.note}</p>}
          </li>
        ))}
      </ul>

      {order.note && <p className="text-sm italic text-sq-secondary">Замовлення: {order.note}</p>}

      <button
        type="button"
        onClick={onAction}
        className="sq-btn-primary w-full min-h-14 text-lg"
        data-testid={actionTestId}
      >
        {action}
      </button>
    </article>
  );
}
