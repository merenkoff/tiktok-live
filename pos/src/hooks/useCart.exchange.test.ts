// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cart as the sale half of an exchange (clothing R1): it starts only from
// an empty till, because folding another customer's half-rung sale or a
// pre-order into an exchange would put their goods on this customer's
// receipt; cancelling it keeps the lines, which become an ordinary sale.

import { beforeEach, describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../test/utils';
import type { ExchangeDraft } from '../types';
import { useCartStore } from './useCart';

const REFUSED = 'Спершу завершіть або очистіть поточний чек — обмін починається з порожнього кошика';

function draft(over: Partial<ExchangeDraft> = {}): ExchangeDraft {
  return {
    saleId: 7,
    saleClientUuid: 'u7',
    receiptNumber: 'R-00042',
    saleCreatedAt: '2026-10-04T10:00:00Z',
    refund: {
      items: [{ sale_item_id: 1, quantity: 1 }],
      method: 'card',
      reason_code: 'size',
      reason: null,
      buyer_name: null,
      buyer_document: null,
      client_uuid: 'rf-uuid',
    },
    returnedCents: 45000,
    returnedLines: [{ name: 'Пальто', label: 'Синій · M', quantity: 1, amount_cents: 45000 }],
    ...over,
  };
}

const cart = () => useCartStore.getState();

beforeEach(() => cart().clear());

describe('useCartStore — exchange', () => {
  it('starts from an empty till and the cart then fills as usual', () => {
    expect(cart().startExchange(draft())).toBeNull();
    expect(cart().exchange?.receiptNumber).toBe('R-00042');
    cart().addItem(makeCatalogItem({ variant_id: 5, price_cents: 70000, quantity: 3 }), 1);
    expect(cart().lines).toHaveLength(1);
    expect(cart().exchange?.refund.client_uuid).toBe('rf-uuid');
  });

  it('refuses over a half-rung sale, with the sentence, and changes nothing', () => {
    cart().addItem(makeCatalogItem({ variant_id: 5, quantity: 3 }), 2);
    expect(cart().startExchange(draft())).toBe(REFUSED);
    expect(cart().exchange).toBeNull();
    expect(cart().lines[0].quantity).toBe(2);
  });

  it('refuses over a pre-order being handed over', () => {
    cart().restore({ lines: [], preorderId: 12 });
    expect(cart().startExchange(draft())).toBe(REFUSED);
    expect(cart().exchange).toBeNull();
  });

  it('refuses a second exchange while one is on the till', () => {
    expect(cart().startExchange(draft())).toBeNull();
    expect(cart().startExchange(draft({ receiptNumber: 'R-00043' }))).toBe(REFUSED);
    expect(cart().exchange?.receiptNumber).toBe('R-00042');
  });

  it('cancelling keeps the lines; clearing forgets the exchange too', () => {
    cart().startExchange(draft());
    cart().addItem(makeCatalogItem({ variant_id: 5, quantity: 3 }), 1);
    cart().cancelExchange();
    expect(cart().exchange).toBeNull();
    expect(cart().lines).toHaveLength(1);

    cart().startExchange(draft());
    expect(cart().exchange).toBeNull(); // the lines are still there
    cart().clear();
    cart().startExchange(draft());
    expect(cart().exchange).not.toBeNull();
    cart().clear();
    expect(cart().exchange).toBeNull();
  });
});
