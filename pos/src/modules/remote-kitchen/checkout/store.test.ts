// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_RETRY_MS, TICKET_TRIES, createRemoteCheckout } from './store';
import type { CafeOrder, CafeSetup } from './lib';
import type { TicketOutcome } from '../ticket/guestTicket';
import { onTicketFailure, type TicketNotice } from '../ticket/notices';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();

const setup: CafeSetup = {
  linkId: 1,
  linkActive: true,
  kitchenTitle: 'Кухня',
  kitchenPhone: '+380',
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
    answer_deadline_at: at(60),
    answer_overdue: false,
    quote_expires_at: null,
    decline_reason: null,
    kitchen_phone: '+380',
    ...over,
  };
}

const pizza = { variant_id: 10, quantity: 1, product_name: 'Маргарита' };
const coffee = { variant_id: 20, quantity: 1, product_name: 'Капучино' };
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(opts: { phone?: boolean } = {}) {
  const api = {
    loadSetup: vi.fn(async () => setup),
    createOrder: vi.fn(async () => view()),
    reviseOrder: vi.fn(async (o: { revision: number }) => view({ revision: o.revision + 1 })),
    readOrder: vi.fn(async () => view()),
    phoneQuote: vi.fn(async () => view({ status: 'quoted', quote_source: 'phone', quoted_minutes: 40, quote_expires_at: at(300) })),
    guestDeclined: vi.fn(async () => view({ status: 'guest_declined' })),
  };
  const cart = {
    hold: null as string | null,
    remoteOrderId: null as number | null,
    phone: null as { minutes: number; agreed_at: string } | null,
  };
  const controls = {
    setCheckoutHold: (r: string | null) => {
      cart.hold = r;
    },
    setRemoteOrderId: (id: number | null) => {
      cart.remoteOrderId = id;
    },
    ...(opts.phone === false
      ? {}
      : {
          setRemotePhone: (a: { minutes: number; agreed_at: string } | null) => {
            cart.phone = a;
          },
        }),
  };
  const net = { online: true, queues: true };
  const printTicket = vi.fn(async (): Promise<TicketOutcome> => ({ kind: 'printed', printer: 'Talon-1' }));
  const store = createRemoteCheckout(
    api as never,
    () => controls,
    () => NOW,
    printTicket,
    () => net.online,
    () => net.queues
  );
  return { api, cart, store, net, printTicket };
}

async function ready(h: ReturnType<typeof harness>, lines = [pizza, coffee]) {
  h.store.sync(lines);
  await flush();
  h.store.sync(lines);
}

describe('the remote-kitchen checkout', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('holds «Оплатити» while a kitchen dish has no agreed time, and lets it go on the guest’s yes', async () => {
    await ready(h);
    expect(h.cart.hold).toMatch(/спершу запитайте кухню/);
    expect(h.cart.remoteOrderId).toBeNull();

    await h.store.ask();
    expect(h.api.createOrder).toHaveBeenCalledWith(expect.any(String), [pizza]);
    expect(h.store.phase()).toBe('asking');
    expect(h.cart.hold).toMatch(/дочекайтеся/);

    h.api.readOrder.mockResolvedValueOnce(view({ status: 'quoted', quoted_minutes: 35, quote_expires_at: at(300) }));
    await h.store.refresh();
    expect(h.store.phase()).toBe('quoted');
    expect(h.cart.hold).toMatch(/чи згоден/);

    h.store.agree();
    expect(h.store.phase()).toBe('agreed');
    expect(h.cart.hold).toBeNull();
    expect(h.cart.remoteOrderId).toBe(5);
  });

  it('says nothing in a store without a remote kitchen', async () => {
    h.api.loadSetup.mockResolvedValueOnce(null as never);
    await ready(h);
    expect(h.store.getState().setup).toBeNull();
    expect(h.cart.hold).toBeNull();
  });

  it('holds nothing while the cart has no kitchen dish', async () => {
    await ready(h, [coffee]);
    expect(h.cart.hold).toBeNull();
  });

  it('sends a changed cart to the kitchen and takes back the guest’s yes', async () => {
    await ready(h);
    await h.store.ask();
    h.api.readOrder.mockResolvedValueOnce(view({ status: 'quoted', quoted_minutes: 35, quote_expires_at: at(300) }));
    await h.store.refresh();
    h.store.agree();
    expect(h.cart.remoteOrderId).toBe(5);

    h.store.sync([{ ...pizza, quantity: 2 }, coffee]);
    expect(h.cart.remoteOrderId).toBeNull();
    expect(h.cart.hold).not.toBeNull();
    await flush();
    expect(h.api.reviseOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 5, revision: 1 }), [{ ...pizza, quantity: 2 }]);
    expect(h.store.phase()).toBe('asking');
  });

  it('releases the kitchen when the dishes leave an unpaid cart, and not after a paid one', async () => {
    await ready(h);
    await h.store.ask();
    h.store.sync([coffee]);
    expect(h.api.guestDeclined).toHaveBeenCalledTimes(1);
    expect(h.cart.hold).toBeNull();

    await ready(h);
    await h.store.ask();
    h.api.readOrder.mockResolvedValueOnce(view({ status: 'quoted', quoted_minutes: 35, quote_expires_at: at(300) }));
    await h.store.refresh();
    h.store.agree();
    // The receipt went through: the host emptied the cart.
    h.store.sync([]);
    expect(h.api.guestDeclined).toHaveBeenCalledTimes(1);
    expect(h.store.getState().order).toBeNull();
  });

  it('records the time said on the phone once the kitchen is silent', async () => {
    h.api.createOrder.mockResolvedValueOnce(view({ answer_deadline_at: at(-1), answer_overdue: true }));
    await ready(h);
    await h.store.ask();
    expect(h.store.phase()).toBe('overdue');
    await h.store.phoneQuote(40);
    expect(h.api.phoneQuote).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 40);
    expect(h.store.phase()).toBe('quoted');
  });

  it('shows a paused kitchen with its phone, and asks nothing', async () => {
    h.api.createOrder.mockRejectedValueOnce({
      response: { data: { error: 'Кухня на паузі', paused: true, kitchen_phone: '+380 67' } },
    });
    await ready(h);
    await h.store.ask();
    expect(h.store.getState().error).toBe('Кухня зараз не приймає замовлень. Телефон: +380 67');
    expect(h.store.getState().order).toBeNull();
  });

  it('retries a failed request under the same key', async () => {
    h.api.createOrder.mockRejectedValueOnce(new Error('network'));
    await ready(h);
    await h.store.ask();
    await h.store.ask();
    const [first, second] = h.api.createOrder.mock.calls.map((call) => (call as unknown[])[0]);
    expect(second).toBe(first);
  });

  it('asks again on the same order after a refusal', async () => {
    await ready(h);
    await h.store.ask();
    h.api.readOrder.mockResolvedValueOnce(view({ status: 'declined', decline_reason: 'Немає тіста' }));
    await h.store.refresh();
    expect(h.store.phase()).toBe('declined');
    await h.store.ask();
    expect(h.api.createOrder).toHaveBeenCalledTimes(1);
    expect(h.api.reviseOrder).toHaveBeenCalledTimes(1);
    expect(h.store.phase()).toBe('asking');
  });

  it('«Гість відмовився» closes the request and keeps the hold', async () => {
    await ready(h);
    await h.store.ask();
    await h.store.decline();
    expect(h.api.guestDeclined).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
    expect(h.store.phase()).toBe('idle');
    expect(h.cart.hold).toMatch(/спершу запитайте кухню/);
  });

  describe('offline, agreed with the kitchen by phone (РК5)', () => {
    it('holds «Оплатити» until the cashier writes the kitchen’s time down, then the receipt carries it', async () => {
      await ready(h);
      h.net.online = false;
      h.store.connectivityChanged();
      expect(h.store.phase()).toBe('offline');
      expect(h.cart.hold).toMatch(/без мережі подзвоніть на кухню/);

      h.store.phoneAgree(43);
      expect(h.store.phase()).toBe('phone_agreed');
      expect(h.cart.hold).toBeNull();
      expect(h.cart.remoteOrderId).toBeNull();
      expect(h.cart.phone).toEqual({ minutes: 45, agreed_at: new Date(NOW).toISOString() });
      expect(h.api.createOrder).not.toHaveBeenCalled();

      // The network is back before «Оплатити»: the guest was told this time, it stands.
      h.net.online = true;
      h.store.connectivityChanged();
      expect(h.store.phase()).toBe('phone_agreed');
      expect(h.cart.phone).not.toBeNull();
    });

    it('a time agreed for these dishes is void for others, and gone with the receipt', async () => {
      await ready(h);
      h.net.online = false;
      h.store.connectivityChanged();
      h.store.phoneAgree(30);
      h.store.sync([{ ...pizza, quantity: 2 }, coffee]);
      expect(h.store.phase()).toBe('offline');
      expect(h.cart.phone).toBeNull();
      expect(h.cart.hold).toMatch(/без мережі/);

      h.store.phoneAgree(30);
      expect(h.cart.phone).not.toBeNull();
      h.store.sync([]);
      expect(h.cart.phone).toBeNull();
      expect(h.cart.hold).toBeNull();
      // Offline, a cart that changes asks the kitchen nothing.
      expect(h.api.reviseOrder).not.toHaveBeenCalled();
    });

    it('on a host that cannot queue the time, kitchen dishes wait for the network', async () => {
      h = harness({ phone: false });
      await ready(h);
      h.net.online = false;
      h.store.connectivityChanged();
      expect(h.cart.hold).toMatch(/лише онлайн/);
      h.store.phoneAgree(30);
      expect(h.store.phase()).toBe('offline');
      expect(h.cart.hold).toMatch(/лише онлайн/);
    });

    it('on a till that queues no offline sale (web, tablet), kitchen dishes wait for the network', async () => {
      await ready(h);
      h.net.queues = false;
      h.net.online = false;
      h.store.connectivityChanged();
      expect(h.store.canPhone()).toBe(false);
      expect(h.cart.hold).toMatch(/лише онлайн/);
      h.store.phoneAgree(30);
      expect(h.store.phase()).toBe('offline');
      expect(h.cart.phone).toBeNull();
    });

    it('over a paused link: the hold says so, and no phone time is taken', async () => {
      h.api.loadSetup.mockResolvedValueOnce({ ...setup, linkActive: false });
      await ready(h);
      h.net.online = false;
      h.store.connectivityChanged();
      expect(h.cart.hold).toMatch(/призупинено/);
      h.store.phoneAgree(30);
      expect(h.cart.phone).toBeNull();
    });

    it('a request asked before the network went is declined once the phone answered — later, if it cannot be now', async () => {
      await ready(h);
      await h.store.ask();
      expect(h.store.getState().order?.id).toBe(5);
      h.net.online = false;
      h.store.connectivityChanged();
      h.api.guestDeclined.mockRejectedValueOnce(new Error('Network Error'));
      h.store.phoneAgree(30);
      expect(h.store.getState().order).toBeNull();
      expect(h.cart.phone).not.toBeNull();
      await flush();
      expect(h.api.guestDeclined).toHaveBeenCalledTimes(1);
      // Back online: the kitchen is told now.
      h.net.online = true;
      h.store.connectivityChanged();
      await flush();
      expect(h.api.guestDeclined).toHaveBeenCalledTimes(2);
      expect(h.api.guestDeclined).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5 }));
      // And only once.
      h.store.connectivityChanged();
      await flush();
      expect(h.api.guestDeclined).toHaveBeenCalledTimes(2);
    });

    it('never asks again a decline the kitchen answered no to', async () => {
      await ready(h);
      await h.store.ask();
      h.net.online = false;
      h.store.connectivityChanged();
      // The request expired meanwhile: a definite answer, not a missing one.
      h.api.guestDeclined.mockRejectedValueOnce(Object.assign(new Error('409'), { response: { status: 409 } }));
      h.store.phoneAgree(30);
      await flush();
      h.net.online = true;
      h.store.connectivityChanged();
      await flush();
      expect(h.api.guestDeclined).toHaveBeenCalledTimes(1);
    });

    it('a first read that failed while the till thought it was online is tried again the moment it goes offline', async () => {
      h.api.loadSetup.mockRejectedValueOnce(new Error('Network Error'));
      h.store.sync([pizza]);
      await flush();
      expect(h.store.getState().setup).toBeUndefined();
      // Within the minute a failed read waits — but the till has just found out it is offline.
      h.api.loadSetup.mockResolvedValueOnce({ ...setup, fromMemory: true });
      h.net.online = false;
      h.store.connectivityChanged();
      await flush();
      expect(h.api.loadSetup).toHaveBeenCalledTimes(2);
      expect(h.store.getState().setup?.fromMemory).toBe(true);
    });

    it('a setup taken from memory while the till says online is read again a minute on, on the next cart change', async () => {
      const clock = { t: NOW };
      const api = { ...harness().api };
      api.loadSetup = vi.fn(async () => ({ ...setup, fromMemory: true as const }));
      const store = createRemoteCheckout(
        api as never,
        () => ({ setCheckoutHold: () => undefined, setRemoteOrderId: () => undefined }),
        () => clock.t,
        undefined,
        () => true,
        () => true
      );
      store.sync([pizza]);
      await flush();
      expect(store.getState().setup?.fromMemory).toBe(true);
      store.sync([pizza, coffee]);
      expect(api.loadSetup).toHaveBeenCalledTimes(1);
      clock.t += SETUP_RETRY_MS;
      api.loadSetup.mockResolvedValueOnce({ ...setup });
      store.sync([{ ...pizza, quantity: 2 }]);
      await flush();
      expect(api.loadSetup).toHaveBeenCalledTimes(2);
      expect(store.getState().setup?.fromMemory).toBeUndefined();
    });

    it('reads the setup again once online when it came from what the till kept', async () => {
      h.api.loadSetup.mockResolvedValueOnce({ ...setup, fromMemory: true });
      h.net.online = false;
      await ready(h);
      expect(h.store.getState().setup?.fromMemory).toBe(true);
      h.net.online = true;
      h.store.connectivityChanged();
      await flush();
      expect(h.api.loadSetup).toHaveBeenCalledTimes(2);
      expect(h.store.getState().setup?.fromMemory).toBeUndefined();
    });
  });

  async function agreedOrder() {
    await ready(h);
    await h.store.ask();
    h.api.readOrder.mockResolvedValueOnce(view({ status: 'quoted', quoted_minutes: 35, quote_expires_at: at(300) }));
    await h.store.refresh();
    h.store.agree();
  }

  it('prints the guest’s ticket once the paid order is numbered', async () => {
    await agreedOrder();
    // The sale: the first read still sees the quote, the next one the paid, numbered order.
    h.api.readOrder
      .mockResolvedValueOnce(view({ status: 'quoted' }))
      .mockResolvedValueOnce({ ...view({ status: 'cooking', promised_at: at(1800) }), order_no: 12 } as never);
    vi.useFakeTimers();
    try {
      h.store.sync([]);
      await vi.advanceTimersByTimeAsync(5000);
    } finally {
      vi.useRealTimers();
    }
    expect(h.printTicket).toHaveBeenCalledTimes(1);
    expect(h.printTicket).toHaveBeenCalledWith(expect.objectContaining({ order_no: 12, status: 'cooking' }));
  });

  it('prints no ticket for an agreed cart emptied without paying, and tells the kitchen the guest declined', async () => {
    await agreedOrder();
    // Cleared, parked or given «під запис»: no sale took the order, it stays quoted.
    h.api.readOrder.mockResolvedValue(view({ status: 'quoted' }));
    vi.useFakeTimers();
    try {
      h.store.sync([coffee]);
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    expect(h.printTicket).not.toHaveBeenCalled();
    expect(h.api.readOrder).toHaveBeenCalledTimes(TICKET_TRIES + 1); // + the quote read in agreedOrder()
    expect(h.api.guestDeclined).toHaveBeenCalledTimes(1);
    expect(h.api.guestDeclined).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('says nothing to the kitchen about an order a sale took', async () => {
    await agreedOrder();
    h.api.readOrder.mockResolvedValue({ ...view({ status: 'paid' }), order_no: 3 } as never);
    vi.useFakeTimers();
    try {
      h.store.sync([]);
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    expect(h.printTicket).toHaveBeenCalledTimes(1);
    expect(h.api.guestDeclined).not.toHaveBeenCalled();
  });

  it('prints once whatever the printer says, and tells the tracker a ticket did not come out', async () => {
    const notices: TicketNotice[] = [];
    const off = onTicketFailure((n) => notices.push(n));
    try {
      await agreedOrder();
      h.api.readOrder.mockResolvedValue({ ...view({ status: 'cooking' }), order_no: 12 } as never);
      // A printer that throws after printing must not be asked again by the next read.
      h.printTicket.mockRejectedValueOnce(new Error('немає паперу'));
      vi.useFakeTimers();
      try {
        h.store.sync([]);
        await vi.advanceTimersByTimeAsync(10000);
      } finally {
        vi.useRealTimers();
      }
      expect(h.printTicket).toHaveBeenCalledTimes(1);
      expect(notices).toEqual([{ orderId: 5, error: 'немає паперу' }]);

      // A printer that answers «failed» is said the same way.
      notices.length = 0;
      h.printTicket.mockResolvedValueOnce({ kind: 'failed', error: 'кришка відкрита' });
      await ready(h);
      await h.store.ask();
      h.api.readOrder.mockResolvedValueOnce(view({ status: 'quoted', quoted_minutes: 35, quote_expires_at: at(300) }));
      await h.store.refresh();
      h.store.agree();
      vi.useFakeTimers();
      try {
        h.store.sync([]);
        await vi.advanceTimersByTimeAsync(10000);
      } finally {
        vi.useRealTimers();
      }
      expect(h.printTicket).toHaveBeenCalledTimes(2);
      expect(notices).toEqual([{ orderId: 5, error: 'кришка відкрита' }]);
    } finally {
      off();
    }
  });
});
