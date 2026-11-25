// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «З кухні» above «Оплатити» (РК2, TechDocs/POS_REMOTE_KITCHEN.md §6.1). When
// the cart holds dishes the remote kitchen cooks, the cashier asks the kitchen
// for a time, tells the guest, and only on the guest's yes may the receipt be
// paid — the sale then carries the order and the kitchen starts at once.
// Draws nothing in a store without a remote kitchen or with no such dish in
// the cart, and nothing on a host too old to hold the payment.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { CheckoutActionProps } from '@host/modules/types';
import { ChefHat, Phone } from '@pos/platform/ui';
import { clampPhoneMinutes, clockOf, defaultPhoneMinutes, dishWord, secondsUntil } from './lib';
import { remoteCheckout, type RemoteCheckout } from './store';
import { remoteCartControls } from '../lib/hostPlatform';

const STEP = 5;

/** One tick a second while a countdown shows; none otherwise. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function KitchenCheckoutAction({ lines, store = remoteCheckout }: CheckoutActionProps & { store?: RemoteCheckout }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const supported = remoteCartControls() != null;

  useEffect(() => {
    if (supported) store.sync(lines);
  }, [lines, state.setup, supported, store]);

  const phase = store.phase();
  const now = useTick(phase === 'asking' || phase === 'quoted' || phase === 'agreed');
  const [phoneMinutes, setPhoneMinutes] = useState<number | null>(null);

  const setup = state.setup;
  if (!supported || !setup || state.lines.length === 0) return null;

  const order = state.order;
  const stale = order != null && state.askedSignature !== state.signature;
  const dishes = state.lines.reduce((sum, line) => sum + line.quantity, 0);
  const phone = order?.kitchen_phone ?? setup.kitchenPhone;
  const minutes = phoneMinutes ?? defaultPhoneMinutes(order);
  const at = clockOf(order?.promised_at ?? null);

  const button = 'min-h-[48px] px-4 rounded-xl font-semibold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50';
  const primary = `${button} bg-sq-blue text-white`;
  const quiet = `${button} bg-white ring-1 ring-sq-divider text-sq-text`;

  let body: ReactNode;
  if (!setup.linkActive) {
    body = <p className="text-[14px] text-sq-secondary">Звʼязок з кухнею призупинено. Страви з кухні зараз не продаються.</p>;
  } else if (stale && state.busy) {
    body = <p className="text-[14px] text-sq-secondary">Кошик змінився — надсилаємо кухні…</p>;
  } else if (phase === 'idle' || (stale && phase !== 'asking')) {
    body = (
      <>
        {!setup.accepting && (
          <p className="text-[14px] text-amber-800" data-testid="remote-checkout-paused">
            Кухня на паузі{phone ? <> · <a className="underline" href={`tel:${phone}`}>{phone}</a></> : null}
          </p>
        )}
        <button type="button" className={primary} disabled={state.busy} onClick={() => void store.ask()}>
          <ChefHat size={20} /> Запитати кухню
        </button>
      </>
    );
  } else if (phase === 'asking') {
    const left = secondsUntil(order?.answer_deadline_at ?? null, now);
    body = (
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] text-sq-text" data-testid="remote-checkout-asking">
          Чекаємо час від кухні{left != null ? <span className="tabular-nums"> · {left} с</span> : null}
        </p>
        <button type="button" className="min-h-11 px-2 text-[14px] text-sq-secondary underline" disabled={state.busy} onClick={() => void store.decline()}>
          Скасувати
        </button>
      </div>
    );
  } else if (phase === 'overdue') {
    body = (
      <div className="space-y-2" data-testid="remote-checkout-overdue">
        <p className="text-[15px] text-sq-text">
          Кухня не відповіла.{' '}
          {phone ? (
            <a className="inline-flex items-center gap-1 font-semibold underline" href={`tel:${phone}`}>
              <Phone size={16} /> {phone}
            </a>
          ) : (
            'Подзвоніть на кухню.'
          )}
        </p>
        <p className="text-[13px] text-sq-secondary">Який час назвала кухня (разом з дорогою)?</p>
        <div className="flex items-center gap-2">
          <button type="button" className={quiet} aria-label="Мінус 5 хвилин" onClick={() => setPhoneMinutes(clampPhoneMinutes(minutes - STEP))}>
            −5
          </button>
          <span className="flex-1 text-center text-[18px] font-bold tabular-nums">{minutes} хв</span>
          <button type="button" className={quiet} aria-label="Плюс 5 хвилин" onClick={() => setPhoneMinutes(clampPhoneMinutes(minutes + STEP))}>
            +5
          </button>
        </div>
        <button type="button" className={`${primary} w-full`} disabled={state.busy} onClick={() => void store.phoneQuote(minutes)}>
          Записати {minutes} хв
        </button>
      </div>
    );
  } else if (phase === 'quoted') {
    const left = secondsUntil(order?.quote_expires_at ?? null, now);
    body = (
      <div className="space-y-2" data-testid="remote-checkout-quoted">
        <p className="text-[15px] text-sq-text">
          Кухня: <span className="font-bold tabular-nums">{order?.quoted_minutes} хв</span>
          {at ? <> — буде о <span className="font-bold tabular-nums">{at}</span></> : null}
          {order?.quote_source === 'phone' ? ' (по телефону)' : order?.quote_source === 'auto' ? ' (автоматично)' : null}
        </p>
        {left != null && left <= 60 ? <p className="text-[13px] text-amber-800 tabular-nums">Час дійсний ще {left} с</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={primary} disabled={state.busy} onClick={() => store.agree()}>
            Гість згоден
          </button>
          <button type="button" className={quiet} disabled={state.busy} onClick={() => void store.decline()}>
            Відмовився
          </button>
        </div>
      </div>
    );
  } else if (phase === 'agreed') {
    body = (
      <div className="flex items-center justify-between gap-2" data-testid="remote-checkout-agreed">
        <p className="text-[15px] text-sq-success-ink">
          Гість згоден{at ? <> · буде о <span className="font-bold tabular-nums">{at}</span></> : null}. Можна оплачувати.
        </p>
        <button type="button" className="min-h-11 px-2 text-[14px] text-sq-secondary underline" onClick={() => store.unagree()}>
          Змінити
        </button>
      </div>
    );
  } else {
    // declined / expired
    body = (
      <div className="space-y-2" data-testid={`remote-checkout-${phase}`}>
        <p className="text-[15px] text-sq-text">
          {phase === 'declined'
            ? `Кухня не зможе${order?.decline_reason ? `: ${order.decline_reason}` : ''}.`
            : 'Час від кухні вже не дійсний.'}
        </p>
        <button type="button" className={`${quiet} w-full`} disabled={state.busy} onClick={() => void store.ask()}>
          Запитати ще раз
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3 py-3 space-y-2" data-testid="remote-checkout">
      <h3 className="text-[14px] font-bold text-amber-900">
        З кухні · {setup.kitchenTitle} · {dishes} {dishWord(dishes)}
      </h3>
      {body}
      {state.error && (
        <p className="text-[13px] text-sq-danger" role="alert" data-testid="remote-checkout-error">
          {state.error}
        </p>
      )}
    </section>
  );
}

export default KitchenCheckoutAction;
