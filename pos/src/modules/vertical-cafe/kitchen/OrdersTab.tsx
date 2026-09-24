// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The two columns of the kitchen board and the card in each (К3c). One
// button per card, `min-h-14`: a cook's hands are wet and the tablet is a
// metre away.

import { useEffect, useReducer } from 'react';
import {
  formatWait,
  orderKey,
  orderLabel,
  orderSubLabel,
  splitColumns,
  waitSeconds,
  waitTone,
} from './lib/kitchen';
import type { KitchenOrder, Station } from './types';
import { useKitchenOrders } from './useKitchenOrders';
import { Check, Clock, X } from '@pos/platform/ui';

const STATION_LABEL: Record<Station, string> = { kitchen: 'кухня', bar: 'бар' };

const TONE_CLASS = {
  ok: 'text-sq-text',
  warn: 'text-amber-600',
  late: 'text-sq-danger',
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
    <div className="flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 space-y-3">
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
            <X size={20} />
          </button>
        </div>
      )}
      {loading && orders.length === 0 && <p className="text-sm text-sq-muted">Завантаження…</p>}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
        <Column title="В роботі" tone="blue" testId="kitchen-in-work" empty="Замовлень немає" wide>
          {inWork.map((order) => (
            <OrderCard
              key={orderKey(order)}
              order={order}
              since={order.created_at}
              offset={offset}
              action="ready"
              actionTestId={`kitchen-ready-${orderKey(order)}`}
              onAction={() => void markReady(order)}
            />
          ))}
        </Column>
        <Column title="Видача" tone="green" testId="kitchen-pickup" empty="Нічого не чекає видачі">
          {pickup.map((order) => (
            <OrderCard
              key={orderKey(order)}
              order={order}
              since={order.ready_at ?? order.created_at}
              offset={offset}
              action="served"
              actionTestId={`kitchen-served-${orderKey(order)}`}
              onAction={() => void markServed(order)}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  tone,
  testId,
  empty,
  wide = false,
  children,
}: {
  title: string;
  tone: 'blue' | 'green';
  testId: string;
  empty: string;
  /** Two cards abreast on a wide board — the «В роботі» column is twice the width. */
  wide?: boolean;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-3 min-w-0" data-testid={testId}>
      <h2 className="flex items-baseline gap-2 pb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
        <span className={`text-[15px] font-bold ${tone === 'blue' ? 'text-sq-blue' : 'text-sq-success'}`}>
          {title}
        </span>
        <span className="text-[13px] text-sq-muted tabular-nums">{children.length}</span>
      </h2>
      {children.length === 0 ? (
        <p className="rounded-card bg-white/60 p-6 text-center text-sm text-sq-muted">{empty}</p>
      ) : (
        <div className={`grid gap-3 items-start ${wide ? 'sm:grid-cols-2' : ''}`}>{children}</div>
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
  action: 'ready' | 'served';
  actionTestId: string;
  onAction: () => void;
}) {
  const seconds = waitSeconds(since, offset);
  const tone = waitTone(seconds);
  const stations = new Set<Station>();
  for (const item of order.items) for (const s of item.stations) stations.add(s);
  const sub = orderSubLabel(order);

  return (
    <article
      className={`rounded-2xl bg-white px-4 py-3.5 flex flex-col gap-2.5 ${
        tone === 'late' ? 'shadow-[0_0_0_2px_rgb(var(--sq-danger-rgb)),0_2px_8px_rgba(0,0,0,.1)]' : 'shadow-card'
      }`}
      data-testid={`kitchen-order-${orderKey(order)}`}
    >
      <div className="flex items-start gap-3">
        <p
          className="text-[32px] font-bold leading-none text-sq-heading tabular-nums break-words min-w-0"
          data-testid="kitchen-order-no"
        >
          {orderLabel(order)}
        </p>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {sub ? (
            <p className="text-[13px] text-sq-secondary" data-testid="kitchen-order-round">
              {sub}
            </p>
          ) : (
            <p className="text-[13px] text-sq-secondary">за стійкою</p>
          )}
          {stations.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...stations].map((s) => (
                <span
                  key={s}
                  className="h-[22px] px-2 rounded-md bg-sq-empty text-xs font-semibold text-sq-secondary inline-flex items-center"
                >
                  {STATION_LABEL[s]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={`flex items-center gap-1 ${TONE_CLASS[tone]}`}>
            <Clock size={20} aria-hidden />
            <span className="text-base font-bold tabular-nums" data-testid="kitchen-wait">
              {formatWait(seconds)}
            </span>
          </span>
          <span className="text-xs text-sq-muted">{order.staff_name}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1 py-2 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-2.5 text-base leading-snug text-sq-text">
            <span className="font-bold tabular-nums shrink-0">{item.quantity}×</span>
            <span className="min-w-0">
              {item.product_name}
              {/* `variant_label` is the fired caption, «M · вівсяне» — the answers
                  are already in it (`lineCaption`), so they are not listed again. */}
              {item.variant_label && <span className="text-sq-secondary"> {item.variant_label}</span>}
              {item.note && <span className="font-semibold text-sq-warning"> · {item.note}</span>}
            </span>
          </li>
        ))}
      </ul>

      {order.note && <p className="text-sm text-sq-secondary -mt-1">Замовлення: {order.note}</p>}

      <button
        type="button"
        onClick={onAction}
        className={`w-full min-h-12 rounded-xl text-[17px] font-semibold text-white inline-flex items-center justify-center gap-2 ${
          action === 'ready' ? 'bg-sq-blue hover:bg-sq-blue-press' : 'bg-sq-success hover:brightness-95'
        }`}
        data-testid={actionTestId}
      >
        {action === 'ready' && <Check size={20} aria-hidden />}
        {action === 'ready' ? 'Готово' : 'Видано'}
      </button>
    </article>
  );
}
