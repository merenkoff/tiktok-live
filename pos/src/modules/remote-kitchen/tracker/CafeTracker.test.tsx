// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Замовлення з кухні» on the cafe's till (РК5). It hangs over EVERY till
// screen, so as with the kitchen's strip what matters first is what it does
// NOT do: poll a store that is no cafe, and take any height while nothing is
// on its way. Then: the stage, the cafe's taps, and the kitchen's cancel.

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CafeTracker, TICKET_PRINTER_RECHECK_MS } from './CafeTracker';
import { noticeTicketFailure } from '../ticket/notices';
import { CAFE_POLL_MS, NOT_CAFE_RECHECK_MS, useCafeOrders } from './useCafeOrders';
import type { TrackedOrder } from './trackerApi';

function order(over: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    id: 5,
    status: 'cooking',
    order_no: 12,
    guest_label: 'Стіл 3',
    kitchen_title: 'Кухня Пульчинелли',
    kitchen_phone: '+380671112233',
    promised_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    paid_at: new Date().toISOString(),
    arrived_at: null,
    decline_reason: null,
    cancelled_by: null,
    cancel_seen_at: null,
    delayed_minutes: 0,
    items: [{ id: 1, product_name: 'Маргарита', variant_label: '32 см', quantity: 1 }],
    ...over,
  };
}

function fakeApi(cafe: boolean, orders: TrackedOrder[] = []) {
  const state = { orders };
  const change = (id: number, patch: Partial<TrackedOrder>): TrackedOrder => {
    state.orders = state.orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    return state.orders.find((o) => o.id === id)!;
  };
  return {
    state,
    isCafe: vi.fn(async () => cafe),
    listCafeSide: vi.fn(async () => ({ orders: state.orders, now: new Date().toISOString() })),
    // Each tap moves the server's order too, as the real one does.
    markArrived: vi.fn(async (id: number) => change(id, { status: 'arrived', arrived_at: new Date().toISOString() })),
    markHanded: vi.fn(async (id: number) => change(id, { status: 'handed_over' })),
    markCancelSeen: vi.fn(async (id: number) => change(id, { cancel_seen_at: new Date().toISOString() })),
  };
}

const noPrinter = async () => false;

function trackerWith(
  api: ReturnType<typeof fakeApi>,
  ticket: { printer?: () => Promise<boolean>; print?: (o: TrackedOrder) => Promise<never> } = {}
) {
  const useFake = () => useCafeOrders(api as never);
  return <CafeTracker hook={useFake} ticketPrinter={ticket.printer ?? noPrinter} printTicket={ticket.print} />;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CafeTracker', () => {
  it('in a store that is no cafe, asks once whether it is one and never polls the orders', async () => {
    const api = fakeApi(false, [order()]);
    const { container } = render(trackerWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAFE_POLL_MS * 3);
    });
    expect(api.isCafe).toHaveBeenCalledTimes(1);
    expect(api.listCafeSide).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOT_CAFE_RECHECK_MS);
    });
    expect(api.isCafe).toHaveBeenCalledTimes(2);
  });

  it('draws nothing while nothing paid is on its way', async () => {
    const api = fakeApi(true, [order({ status: 'quoted' }), order({ id: 6, status: 'handed_over' })]);
    const { container } = render(trackerWith(api));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.listCafeSide).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('follows the order through the kitchen and on to the guest', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi(true, [order()]);
    render(trackerWith(api));
    const row = await screen.findByTestId('remote-tracker-5');
    expect(row).toHaveTextContent('П-12 · Стіл 3');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Готується');
    expect(screen.queryByTestId('remote-tracker-step-5')).toBeNull(); // the kitchen's to move now

    api.state.orders = [order({ status: 'dispatched' })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAFE_POLL_MS);
    });
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Їде');
    await user.click(screen.getByRole('button', { name: 'Привезли' }));
    expect(api.markArrived).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('listitem', { current: 'step' })).toHaveTextContent('Привезли');

    await user.click(await screen.findByRole('button', { name: 'Видали гостю' }));
    expect(api.markHanded).toHaveBeenCalledWith(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('remote-tracker')).toBeNull();
  });

  it('says a pizza is late, and by how much the kitchen moved it', async () => {
    const api = fakeApi(true, [
      order({ id: 5, promised_at: new Date(Date.now() - 4 * 60_000).toISOString() }),
      order({ id: 6, order_no: 13, delayed_minutes: 10 }),
    ]);
    render(trackerWith(api));
    expect(await screen.findByTestId('remote-tracker-time-5')).toHaveTextContent('запізнюється на 4 хв');
    expect(screen.getByTestId('remote-tracker-time-6')).toHaveTextContent('кухня додала 10 хв');
  });

  it('keeps the kitchen’s cancel in red until the cashier says the guest got the money back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const cancelled = order({ status: 'cancelled', cancelled_by: 'kitchen', decline_reason: 'Згоріла піч' });
    const api = fakeApi(true, [cancelled]);
    render(trackerWith(api));
    const row = await screen.findByTestId('remote-tracker-cancel-5');
    expect(row).toHaveTextContent('П-12 · Стіл 3 — скасовано кухнею — поверніть гостю');
    expect(row).toHaveTextContent('Згоріла піч');
    await user.click(screen.getByRole('button', { name: 'Гостю повернули' }));
    expect(api.markCancelSeen).toHaveBeenCalledWith(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('remote-tracker')).toBeNull();
  });

  it('names the cafe’s receipt on the kitchen’s cancel, so the cashier finds it in «Чеки»', async () => {
    const api = fakeApi(true, [
      order({ status: 'cancelled', cancelled_by: 'kitchen', cafe_receipt_number: 'ЧК-000123' }),
    ]);
    render(trackerWith(api));
    expect(await screen.findByTestId('remote-tracker-cancel-5')).toHaveTextContent(
      'П-12 · Стіл 3 · чек ЧК-000123 — скасовано кухнею — поверніть гостю'
    );
  });

  it('lets the cafe close an order the kitchen forgot to mark, well late, after one question', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi(true, [order({ status: 'cooking', promised_at: new Date(Date.now() - 25 * 60_000).toISOString() })]);
    render(trackerWith(api));
    await user.click(await screen.findByRole('button', { name: 'Вже привезли' }));
    expect(screen.getByTestId('remote-tracker-confirm-5')).toHaveTextContent('Кухня не відмітила');
    expect(api.markArrived).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ні' }));
    expect(screen.queryByTestId('remote-tracker-confirm-5')).toBeNull();
    expect(api.markArrived).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Вже привезли' }));
    await user.click(screen.getByRole('button', { name: 'Так, привезли' }));
    expect(api.markArrived).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('button', { name: 'Видали гостю' })).toBeInTheDocument();
  });

  it('offers nothing on an order the kitchen is cooking on time', async () => {
    const api = fakeApi(true, [order({ status: 'cooking', promised_at: new Date(Date.now() - 5 * 60_000).toISOString() })]);
    render(trackerWith(api));
    expect(await screen.findByTestId('remote-tracker-time-5')).toHaveTextContent('запізнюється на 5 хв');
    expect(screen.queryByTestId('remote-tracker-step-5')).toBeNull();
  });

  it('drops a read that started before a tap, so the answered cancel does not come back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const cancelled = order({ status: 'cancelled', cancelled_by: 'kitchen' });
    const api = fakeApi(true, [cancelled]);
    render(trackerWith(api));
    await screen.findByTestId('remote-tracker-cancel-5');

    // A poll goes out and hangs; the cashier answers meanwhile.
    let releaseStale: (v: { orders: TrackedOrder[]; now: string }) => void = () => undefined;
    api.listCafeSide.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseStale = resolve;
      })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAFE_POLL_MS);
    });
    await user.click(screen.getByRole('button', { name: 'Гостю повернули' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('remote-tracker')).toBeNull();

    // The old read lands last, with the cancel still unanswered: ignored.
    await act(async () => {
      releaseStale({ orders: [cancelled], now: new Date().toISOString() });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByTestId('remote-tracker')).toBeNull();
  });

  it('shows a refused tap in the server’s words', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi(true, [order({ status: 'ready' })]);
    api.markArrived.mockRejectedValueOnce({ response: { data: { error: 'Ще не відправлено' } } });
    render(trackerWith(api));
    await user.click(await screen.findByRole('button', { name: 'Привезли' }));
    expect(await screen.findByTestId('remote-tracker-banner')).toHaveTextContent('Ще не відправлено');
  });

  it('prints the guest’s ticket again with «Талон» where this device has a printer for it', async () => {
    const api = fakeApi(true, [order()]);
    const print = vi.fn(async () => ({ kind: 'failed', error: 'немає паперу' }) as never);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(trackerWith(api, { printer: async () => true, print }));
    await user.click(await screen.findByTestId('remote-tracker-ticket-5'));
    expect(print).toHaveBeenCalledWith(expect.objectContaining({ id: 5, order_no: 12 }));
    expect(await screen.findByTestId('remote-tracker-ticket-error')).toHaveTextContent('Талон не надруковано: немає паперу');
  });

  it('has no «Талон» on a device with no printer for it', async () => {
    const api = fakeApi(true, [order()]);
    render(trackerWith(api));
    await screen.findByTestId('remote-tracker-5');
    expect(screen.queryByTestId('remote-tracker-ticket-5')).toBeNull();
  });
  it('finds a printer picked on «Обладнання» without a restart — the tracker is never mounted afresh', async () => {
    const api = fakeApi(true, [order()]);
    let printer = false;
    const check = vi.fn(async () => printer);
    render(trackerWith(api, { printer: check }));
    await screen.findByTestId('remote-tracker-5');
    expect(screen.queryByTestId('remote-tracker-ticket-5')).toBeNull();
    printer = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_PRINTER_RECHECK_MS);
    });
    expect(screen.getByTestId('remote-tracker-ticket-5')).toBeInTheDocument();
  });

  it('says so when the printer is gone at the tap, and takes «Талон» away', async () => {
    const api = fakeApi(true, [order()]);
    const print = vi.fn(async () => ({ kind: 'none' }) as never);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(trackerWith(api, { printer: async () => true, print }));
    await user.click(await screen.findByTestId('remote-tracker-ticket-5'));
    expect(await screen.findByTestId('remote-tracker-ticket-error')).toHaveTextContent(
      'П-12 · Стіл 3 · Немає принтера для талона — оберіть його на «Обладнанні».'
    );
    expect(screen.queryByTestId('remote-tracker-ticket-5')).toBeNull();
  });

  it('prints one ticket per tap, however fast the second tap comes', async () => {
    const api = fakeApi(true, [order()]);
    let finish: (v: never) => void = () => undefined;
    const print = vi.fn(() => new Promise<never>((resolve) => (finish = resolve)));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(trackerWith(api, { printer: async () => true, print }));
    const button = await screen.findByTestId('remote-tracker-ticket-5');
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ kind: 'printed', printer: 'Talon-1' } as never);
    });
    expect(button).toBeEnabled();
  });

  it('shows the after-sale ticket that did not come out under its order, and never over another', async () => {
    const api = fakeApi(true, [order()]);
    render(trackerWith(api));
    await screen.findByTestId('remote-tracker-5');
    act(() => noticeTicketFailure({ orderId: 5, error: 'немає паперу' }));
    expect(screen.getByTestId('remote-tracker-ticket-error')).toHaveTextContent('П-12 · Стіл 3 · Талон не надруковано: немає паперу');

    // The order leaves the list; the next one must not inherit its error.
    api.state.orders = [order({ id: 6, order_no: 13 })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAFE_POLL_MS);
    });
    await screen.findByTestId('remote-tracker-6');
    expect(screen.queryByTestId('remote-tracker-ticket-error')).toBeNull();
  });
});
