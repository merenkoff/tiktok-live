// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Замовлення точок» on the kitchen's «Прийом запитів» (РК5): every paid
// order still in the kitchen, the time promised to the cafe, and the two
// things only the kitchen can say about it — «+10 хв» and «Скасувати». Both
// reach the cafe's till by themselves («кухня додала 10 хв», a red
// «скасовано кухнею — поверніть гостю»), so nobody has to phone. «Готово» and
// «Видано» stay on the kitchen's board, where the cook already taps them.

import { useState } from 'react';
import { SectionHead } from '@pos/platform/ui';
import type { KitchenOrder } from './ordersApi';
import { CANCEL_REASONS, DELAY_STEP_MINUTES, cancelReason } from './ordersLib';
import { useKitchenOrders } from './useKitchenOrders';
import { clockOf, itemsLine, minutesLate, numberOf } from '../tracker/lib';

const STATUS_TEXT: Record<string, string> = {
  paid: 'оплачено',
  cooking: 'готується',
  ready: 'готово, чекає курʼєра',
};

export function KitchenOrdersSection({
  hook = useKitchenOrders,
}: { hook?: () => ReturnType<typeof useKitchenOrders> } = {}): JSX.Element {
  const { orders, offset, loaded, note, busy, act } = hook();
  const now = Date.now() + offset;

  return (
    <section aria-label="Замовлення точок" className="space-y-3" data-testid="rk-kitchen-orders">
      <SectionHead title={`Замовлення точок${orders.length > 0 ? ` · ${orders.length}` : ''}`} />
      {note && (
        <p className={`text-[15px] ${note.ok ? 'text-sq-success' : 'text-sq-danger'}`} role="status">
          {note.text}
        </p>
      )}
      {loaded && orders.length === 0 && (
        <p className="text-[15px] text-sq-secondary">Оплачених замовлень у роботі немає.</p>
      )}
      <ul className="flex flex-col gap-2">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            now={now}
            busy={busy.has(order.id)}
            onDelay={() => void act(order, { kind: 'delay', minutes: DELAY_STEP_MINUTES })}
            onCancel={(reason) => act(order, { kind: 'cancel', reason })}
          />
        ))}
      </ul>
    </section>
  );
}

function OrderCard({
  order,
  now,
  busy,
  onDelay,
  onCancel,
}: {
  order: KitchenOrder;
  now: number;
  busy: boolean;
  onDelay: () => void;
  onCancel: (reason: string) => Promise<boolean>;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const reason = cancelReason(chosen, typed);
  const late = minutesLate(order, now);
  const delayed = order.delayed_minutes ?? 0;
  const head = [numberOf(order), order.cafe_name, order.guest_label].filter(Boolean).join(' · ');

  return (
    <li className="rounded-xl bg-white shadow-card px-4 py-3 space-y-2" data-testid={`rk-kitchen-order-${order.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold text-sq-heading">{head}</p>
        <p className="text-[13px] text-sq-secondary">{STATUS_TEXT[order.status] ?? order.status}</p>
      </div>
      <p className="text-[15px]">{itemsLine(order)}</p>
      <p className="text-[13px]" data-testid={`rk-kitchen-order-time-${order.id}`}>
        {order.promised_at && <span className="text-sq-secondary">кафе обіцяно до {clockOf(order.promised_at)}</span>}
        {late > 0 && <span className="font-semibold text-sq-danger"> · запізнюється на {late} хв</span>}
        {delayed > 0 && <span className="text-sq-warning"> · додали {delayed} хв</span>}
      </p>
      {cancelling ? (
        <div className="space-y-2 rounded-xl bg-red-50 px-3 py-2" data-testid={`rk-kitchen-cancel-${order.id}`}>
          <p className="text-[13px] text-red-700">
            Кафе побачить скасування червоним і поверне гостю гроші. Що сталося?
          </p>
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={chosen === r}
                className={chosen === r ? 'sq-btn-primary' : 'sq-btn-quiet'}
                onClick={() => setChosen(chosen === r ? null : r)}
              >
                {r}
              </button>
            ))}
          </div>
          {chosen == null && (
            <input
              className="sq-input w-full"
              placeholder="Інша причина"
              aria-label="Інша причина"
              maxLength={160}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 px-3 rounded-xl bg-sq-danger text-[15px] font-semibold text-white disabled:opacity-60"
              disabled={busy || reason === ''}
              onClick={() => {
                void onCancel(reason).then((ok) => {
                  if (ok) setCancelling(false);
                });
              }}
              data-testid={`rk-kitchen-cancel-confirm-${order.id}`}
            >
              Скасувати замовлення
            </button>
            <button type="button" className="sq-btn-quiet" onClick={() => setCancelling(false)}>
              Назад
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="sq-btn-quiet"
            disabled={busy}
            onClick={onDelay}
            data-testid={`rk-kitchen-delay-${order.id}`}
          >
            +{DELAY_STEP_MINUTES} хв
          </button>
          <button
            type="button"
            className="sq-btn-quiet text-sq-danger"
            disabled={busy}
            onClick={() => setCancelling(true)}
            data-testid={`rk-kitchen-cancel-open-${order.id}`}
          >
            Скасувати…
          </button>
        </div>
      )}
    </li>
  );
}
