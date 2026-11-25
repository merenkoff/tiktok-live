// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from '@pos/platform';
import type { CartLine } from '@host/hooks/useCart';
import { KitchenCheckoutAction } from './KitchenCheckoutAction';
import { createRemoteCheckout } from './store';
import type { CafeOrder, CafeSetup } from './lib';

const setup: CafeSetup = {
  linkId: 1,
  linkActive: true,
  kitchenTitle: 'Pulcinella кухня',
  kitchenPhone: '+380671112233',
  answerSeconds: 60,
  accepting: true,
  variantIds: new Set([10]),
};

function view(over: Partial<CafeOrder> = {}): CafeOrder {
  return {
    id: 5,
    revision: 1,
    status: 'requested',
    quote_source: null,
    quoted_minutes: null,
    suggested_minutes: 35,
    promised_at: null,
    answer_deadline_at: new Date(Date.now() + 60_000).toISOString(),
    answer_overdue: false,
    quote_expires_at: null,
    decline_reason: null,
    kitchen_phone: '+380671112233',
    ...over,
  };
}

function line(variant_id: number, quantity: number, name: string): CartLine {
  return {
    uid: String(variant_id),
    variant_id,
    product_name: name,
    variant_label: '',
    unit: 'шт',
    quantity,
    max_quantity: 99,
    unit_price_cents: 20000,
  } as CartLine;
}

const props = { customer: null, cartDiscount: null, totalCents: 0, onCompleted: () => undefined };

afterEach(() => {
  useCartStore.getState().clear();
});

function api() {
  return {
    loadSetup: vi.fn(async () => setup),
    createOrder: vi.fn(async () => view()),
    reviseOrder: vi.fn(async () => view({ revision: 2 })),
    readOrder: vi.fn(async () => view()),
    phoneQuote: vi.fn(async () => view()),
    guestDeclined: vi.fn(async () => view({ status: 'guest_declined' })),
  };
}

describe('«З кухні» above «Оплатити»', () => {
  it('draws nothing for a cart with no kitchen dish', async () => {
    const store = createRemoteCheckout(api() as never);
    render(<KitchenCheckoutAction {...props} lines={[line(20, 1, 'Капучино')]} store={store} />);
    await act(async () => undefined);
    expect(screen.queryByTestId('remote-checkout')).toBeNull();
    expect(useCartStore.getState().checkoutHold).toBeNull();
  });

  it('asks the kitchen, shows the time, and lets the till pay on the guest’s yes', async () => {
    const calls = api();
    const store = createRemoteCheckout(calls as never);
    const lines = [line(10, 2, 'Маргарита'), line(20, 1, 'Капучино')];
    render(<KitchenCheckoutAction {...props} lines={lines} store={store} />);
    await act(async () => undefined);

    expect(screen.getByTestId('remote-checkout').textContent).toContain('Pulcinella кухня · 2 страви');
    expect(useCartStore.getState().checkoutHold).toMatch(/спершу запитайте кухню/);

    await userEvent.click(screen.getByRole('button', { name: /Запитати кухню/ }));
    expect(calls.createOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('remote-checkout-asking')).toBeTruthy();

    const promised = new Date();
    promised.setHours(13, 40, 0, 0);
    calls.readOrder.mockResolvedValueOnce(
      view({
        status: 'quoted',
        quoted_minutes: 40,
        promised_at: promised.toISOString(),
        quote_expires_at: new Date(Date.now() + 300_000).toISOString(),
      })
    );
    await act(async () => store.refresh());
    expect(screen.getByTestId('remote-checkout-quoted').textContent).toContain('40 хв — буде о 13:40');
    expect(useCartStore.getState().remoteOrderId).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Гість згоден' }));
    expect(screen.getByTestId('remote-checkout-agreed').textContent).toContain('Можна оплачувати');
    expect(useCartStore.getState().checkoutHold).toBeNull();
    expect(useCartStore.getState().remoteOrderId).toBe(5);
  });

  it('offers the phone when the kitchen is silent', async () => {
    const calls = api();
    calls.createOrder.mockResolvedValueOnce(view({ answer_overdue: true, answer_deadline_at: new Date(Date.now() - 1000).toISOString() }));
    const store = createRemoteCheckout(calls as never);
    render(<KitchenCheckoutAction {...props} lines={[line(10, 1, 'Маргарита')]} store={store} />);
    await act(async () => undefined);
    await userEvent.click(screen.getByRole('button', { name: /Запитати кухню/ }));

    const overdue = screen.getByTestId('remote-checkout-overdue');
    expect(overdue.querySelector('a[href="tel:+380671112233"]')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Плюс 5 хвилин' }));
    await userEvent.click(screen.getByRole('button', { name: 'Записати 40 хв' }));
    expect(calls.phoneQuote).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 40);
  });
});
