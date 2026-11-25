// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRemoteCheckout } from './store';
import type { CafeOrder, CafeSetup } from './lib';

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

function harness() {
  const api = {
    loadSetup: vi.fn(async () => setup),
    createOrder: vi.fn(async () => view()),
    reviseOrder: vi.fn(async (o: { revision: number }) => view({ revision: o.revision + 1 })),
    readOrder: vi.fn(async () => view()),
    phoneQuote: vi.fn(async () => view({ status: 'quoted', quote_source: 'phone', quoted_minutes: 40, quote_expires_at: at(300) })),
    guestDeclined: vi.fn(async () => view({ status: 'guest_declined' })),
  };
  const cart = { hold: null as string | null, remoteOrderId: null as number | null };
  const controls = {
    setCheckoutHold: (r: string | null) => {
      cart.hold = r;
    },
    setRemoteOrderId: (id: number | null) => {
      cart.remoteOrderId = id;
    },
  };
  const store = createRemoteCheckout(api as never, () => controls, () => NOW);
  return { api, cart, store };
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
});
