// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Замовлення точок» on the kitchen's till (РК5): the only place the kitchen
// says «+10 хв» or cancels a paid order — what the cafe's tracker shows its
// cashier instead of a phone call.

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenOrdersSection } from './KitchenOrdersSection';
import { KITCHEN_ORDERS_POLL_MS, useKitchenOrders } from './useKitchenOrders';
import type { KitchenOrder } from './ordersApi';

function order(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: 5,
    status: 'cooking',
    order_no: 12,
    cafe_name: 'Pulcinella Park',
    guest_label: 'Стіл 3',
    promised_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    delayed_minutes: 0,
    items: [{ id: 1, product_name: 'Маргарита', variant_label: '32 см', quantity: 1 }],
    ...over,
  };
}

function fakeApi(orders: KitchenOrder[]) {
  const state = { orders };
  const change = (id: number, patch: Partial<KitchenOrder>) => {
    state.orders = state.orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    return state.orders.find((o) => o.id === id)!;
  };
  return {
    state,
    listKitchenOrders: vi.fn(async () => ({ orders: state.orders, now: new Date().toISOString() })),
    delayOrder: vi.fn(async (id: number, minutes: number) =>
      change(id, { delayed_minutes: (state.orders.find((o) => o.id === id)!.delayed_minutes ?? 0) + minutes })
    ),
    cancelOrder: vi.fn(async (id: number) => change(id, { status: 'cancelled' })),
  };
}

function sectionWith(api: ReturnType<typeof fakeApi>) {
  const useFake = () => useKitchenOrders(api as never);
  return <KitchenOrdersSection hook={useFake} />;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('KitchenOrdersSection', () => {
  it('lists only what the kitchen can still move, the soonest promise first', async () => {
    const api = fakeApi([
      order({ id: 1, promised_at: new Date(Date.now() + 40 * 60_000).toISOString() }),
      order({ id: 2, status: 'dispatched' }),
      order({ id: 3, status: 'ready', promised_at: new Date(Date.now() + 5 * 60_000).toISOString() }),
      order({ id: 4, status: 'cancelled' }),
      order({ id: 6, status: 'requested' }),
    ]);
    render(sectionWith(api));
    await screen.findByTestId('rk-kitchen-order-3');
    const ids = screen.getAllByTestId(/^rk-kitchen-order-\d+$/).map((el) => el.dataset.testid);
    expect(ids).toEqual(['rk-kitchen-order-3', 'rk-kitchen-order-1']);
    expect(screen.getByTestId('rk-kitchen-order-1')).toHaveTextContent('П-12 · Pulcinella Park · Стіл 3');
  });

  it('says so when nothing paid is in the kitchen', async () => {
    render(sectionWith(fakeApi([])));
    expect(await screen.findByText('Оплачених замовлень у роботі немає.')).toBeInTheDocument();
  });

  it('adds ten minutes in one tap, and tells the cook the cafe sees it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi([order()]);
    render(sectionWith(api));
    await user.click(await screen.findByRole('button', { name: '+10 хв' }));
    expect(api.delayOrder).toHaveBeenCalledWith(5, 10);
    expect(await screen.findByRole('status')).toHaveTextContent('кафе бачить новий час');
    expect(screen.getByTestId('rk-kitchen-order-time-5')).toHaveTextContent('додали 10 хв');
  });

  it('cancels only with a reason, and the order leaves the list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi([order()]);
    render(sectionWith(api));
    await user.click(await screen.findByRole('button', { name: 'Скасувати…' }));
    const confirm = screen.getByTestId('rk-kitchen-cancel-confirm-5');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Інша причина'), 'Згоріла піч');
    expect(confirm).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Немає продуктів' }));
    await user.click(confirm);
    expect(api.cancelOrder).toHaveBeenCalledWith(5, 'Немає продуктів');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('rk-kitchen-order-5')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('поверне гостю гроші');
  });

  it('keeps the cancel open with the server’s words when it is refused', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi([order()]);
    api.cancelOrder.mockRejectedValueOnce({
      response: { data: { error: 'Скасувати можна лише оплачене й ще не відправлене замовлення' } },
    });
    render(sectionWith(api));
    await user.click(await screen.findByRole('button', { name: 'Скасувати…' }));
    await user.click(screen.getByRole('button', { name: 'Не встигаємо' }));
    await user.click(screen.getByTestId('rk-kitchen-cancel-confirm-5'));
    expect(await screen.findByRole('status')).toHaveTextContent('ще не відправлене');
    expect(screen.getByTestId('rk-kitchen-cancel-5')).toBeInTheDocument();
  });

  it('reads again every ten seconds', async () => {
    const api = fakeApi([order()]);
    render(sectionWith(api));
    await screen.findByTestId('rk-kitchen-order-5');
    const before = api.listKitchenOrders.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KITCHEN_ORDERS_POLL_MS);
    });
    expect(api.listKitchenOrders.mock.calls.length).toBe(before + 1);
  });
});
