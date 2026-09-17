// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../test/utils';
import { cartLinesFromParked } from '../lib/parkedCart';
import { computeCartDiscountCents, useCartStore, type CartLine } from './useCart';

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    variant_id: 1,
    product_name: 'Футболка',
    variant_label: 'Синій / M',
    unit: 'шт',
    unit_price_cents: 10000,
    quantity: 2,
    max_quantity: 5,
    ...overrides,
  };
}

const cart = () => useCartStore.getState();

describe('computeCartDiscountCents', () => {
  it('is zero without a cart discount', () => {
    expect(computeCartDiscountCents([makeLine()], null)).toBe(0);
  });

  it('applies a percentage to the eligible subtotal', () => {
    expect(computeCartDiscountCents([makeLine()], { type: 'percent', value: 10 })).toBe(2000);
  });

  it('clamps the percentage to 0..100', () => {
    expect(computeCartDiscountCents([makeLine()], { type: 'percent', value: 150 })).toBe(20000);
    expect(computeCartDiscountCents([makeLine()], { type: 'percent', value: -5 })).toBe(0);
  });

  it('never gives back more than the eligible subtotal for a fixed discount', () => {
    expect(computeCartDiscountCents([makeLine()], { type: 'fixed', value: 5000 })).toBe(5000);
    expect(computeCartDiscountCents([makeLine()], { type: 'fixed', value: 99999 })).toBe(20000);
    expect(computeCartDiscountCents([makeLine()], { type: 'fixed', value: -100 })).toBe(0);
  });

  it('ignores lines that already carry a product discount', () => {
    const discounted = makeLine({ variant_id: 2, compare_at_cents: 15000 });
    expect(computeCartDiscountCents([discounted], { type: 'percent', value: 10 })).toBe(0);
    expect(
      computeCartDiscountCents([makeLine(), discounted], { type: 'percent', value: 10 })
    ).toBe(2000);
  });

  it('is zero when nothing is eligible', () => {
    expect(computeCartDiscountCents([], { type: 'fixed', value: 500 })).toBe(0);
  });
});

describe('useCartStore', () => {
  it('adds a new line and derives the totals', () => {
    cart().addItem(makeCatalogItem({ price_cents: 10000, quantity: 5 }), 2);

    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0]).toMatchObject({ quantity: 2, max_quantity: 5, unit_price_cents: 10000 });
    expect(cart().banner).toBeNull();
    expect(cart().subtotalCents()).toBe(20000);
    expect(cart().totalCents()).toBe(20000);
    expect(cart().itemCount()).toBe(2);
  });

  it('refuses an out-of-stock item and explains why', () => {
    cart().addItem(makeCatalogItem({ quantity: 0 }));

    expect(cart().lines).toEqual([]);
    expect(cart().banner).toBe('Немає в наявності');
  });

  it('caps a new line at what is on hand', () => {
    cart().addItem(makeCatalogItem({ quantity: 3 }), 10);
    expect(cart().lines[0].quantity).toBe(3);
  });

  it('merges a repeat scan into the existing line', () => {
    const item = makeCatalogItem({ quantity: 5 });
    cart().addItem(item, 1);
    cart().addItem(item, 2);

    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0].quantity).toBe(3);
  });

  it('warns instead of merging when the line is already at the stock ceiling', () => {
    const item = makeCatalogItem({ quantity: 2 });
    cart().addItem(item, 2);
    cart().addItem(item, 1);

    expect(cart().lines[0].quantity).toBe(2);
    expect(cart().banner).toBe('Недостатньо залишку');
  });

  it('carries the product discount onto the line', () => {
    cart().addItem(makeCatalogItem({ price_cents: 8000, compare_at_cents: 10000 }));

    expect(cart().lines[0]).toMatchObject({
      compare_at_cents: 10000,
      discount_label: 'Знижка (20%)',
    });
  });

  it('ignores a compare-at price that is not actually a discount', () => {
    cart().addItem(makeCatalogItem({ price_cents: 10000, compare_at_cents: 10000 }));

    expect(cart().lines[0]).toMatchObject({ compare_at_cents: null, discount_label: null });
  });

  it('takes the caption and unit the server derived, never composing one', () => {
    // The rule belongs to the store's vertical; four client-side composers
    // had already drifted to three different separators before this.
    cart().addItem(makeCatalogItem({ label: 'Червона · 60 см', unit: 'шт' }));
    expect(cart().lines[0]).toMatchObject({ variant_label: 'Червона · 60 см', unit: 'шт' });
  });

  it('clamps setQty to the stock ceiling and warns', () => {
    cart().addItem(makeCatalogItem({ quantity: 3 }), 1);
    cart().setQty('1', 9);

    expect(cart().lines[0].quantity).toBe(3);
    expect(cart().banner).toBe('Недостатньо залишку');
  });

  it('drops a line set to zero', () => {
    cart().addItem(makeCatalogItem());
    cart().setQty('1', 0);

    expect(cart().lines).toEqual([]);
  });

  it('leaves other lines alone when changing one', () => {
    cart().addItem(makeCatalogItem({ variant_id: 1 }));
    cart().addItem(makeCatalogItem({ variant_id: 2 }));
    cart().setQty('2', 3);

    expect(cart().lines.map((l) => [l.variant_id, l.quantity])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('removes a line by its uid', () => {
    cart().addItem(makeCatalogItem({ variant_id: 1 }));
    cart().addItem(makeCatalogItem({ variant_id: 2 }));
    cart().remove('1');

    expect(cart().lines.map((l) => l.variant_id)).toEqual([2]);
  });

  describe('a bouquet assembled at the counter', () => {
    const bouquet = (stems: number) => ({
      variant_id: 7,
      product_name: 'Букет на замовлення',
      variant_label: `${stems} стебел`,
      unit: 'шт',
      unit_price_cents: stems * 10000,
      quantity: 1,
      components: [
        {
          component_variant_id: 1,
          quantity: stems,
          product_name: 'Троянда',
          label: 'Червона · 60 см',
          unit: 'шт',
          unit_price_cents: 10000,
        },
      ],
    });

    it('never merges with another bouquet off the same card', () => {
      // Two custom bouquets are two different bouquets. Merging them would
      // throw one of the two recipes away — the server refuses to, and the
      // cart must not do it either.
      cart().addAssembled(bouquet(9));
      cart().addAssembled(bouquet(5));

      expect(cart().lines).toHaveLength(2);
      expect(cart().lines.map((l) => l.variant_label)).toEqual(['9 стебел', '5 стебел']);
      expect(new Set(cart().lines.map((l) => l.uid)).size).toBe(2);
    });

    it('never merges with an ordinary line of the same variant either', () => {
      cart().addItem(makeCatalogItem({ variant_id: 7 }));
      cart().addAssembled(bouquet(9));

      expect(cart().lines).toHaveLength(2);
    });

    it('is edited and removed by its own uid', () => {
      cart().addAssembled(bouquet(9));
      cart().addAssembled(bouquet(5));
      const [first, second] = cart().lines;

      cart().remove(first.uid);

      expect(cart().lines.map((l) => l.uid)).toEqual([second.uid]);
      expect(cart().lines[0].components).toHaveLength(1);
    });

    it('refuses an empty bouquet rather than ringing nothing', () => {
      cart().addAssembled({ ...bouquet(0), components: [] });

      expect(cart().lines).toEqual([]);
      expect(cart().banner).toBe('Букет порожній');
    });

    it('counts toward the subtotal at the price it was assembled for', () => {
      cart().addAssembled(bouquet(9));

      expect(cart().subtotalCents()).toBe(90000);
    });
  });

  it('subtracts the cart discount from the total but never below zero', () => {
    cart().addItem(makeCatalogItem({ price_cents: 10000, quantity: 5 }), 2);
    cart().setCartDiscount({ type: 'fixed', value: 5000 });

    expect(cart().cartDiscountCents()).toBe(5000);
    expect(cart().totalCents()).toBe(15000);

    cart().setCartDiscount({ type: 'percent', value: 100 });
    expect(cart().totalCents()).toBe(0);
  });

  describe('restoring a parked cart', () => {
    const parkedItem = (over: Record<string, unknown> = {}) => ({
      id: 7,
      variant_id: 42,
      quantity: 3,
      product_name: 'Троянда',
      label: 'Червона',
      unit: 'шт',
      line_price_cents: 9000,
      image_url: null,
      components: null,
      ...over,
    });

    it('prices a line at what the server says it costs', () => {
      const [line] = cartLinesFromParked({ items: [parkedItem()] });

      expect(line).toMatchObject({
        variant_id: 42,
        quantity: 3,
        unit_price_cents: 9000,
        variant_label: 'Червона',
      });
    });

    it('caps a restored line at what was parked', () => {
      // The reserve behind this cart covers exactly these flowers. Letting the
      // cashier raise the line would spend stock nobody checked — adding more
      // is what the catalog is for, and `addItem` does check.
      const [line] = cartLinesFromParked({ items: [parkedItem({ quantity: 3 })] });

      expect(line.max_quantity).toBe(3);
    });

    it('keeps a parked bouquet in a line of its own', () => {
      // Same rule as at the counter: two custom bouquets are two bouquets, and
      // an ordinary rose must never merge into one of them.
      const lines = cartLinesFromParked({
        items: [
          parkedItem({ id: 1, components: [{ component_variant_id: 42, quantity: 9 }] }),
          parkedItem({ id: 2, components: [{ component_variant_id: 42, quantity: 5 }] }),
          parkedItem({ id: 3, components: null }),
        ],
      });

      expect(new Set(lines.map((l) => l.uid)).size).toBe(3);
      expect(lines[2].uid).toBe('42');
      expect(lines[0].components).toHaveLength(1);
    });

    it('replaces the screen rather than merging into what is on it', () => {
      // Folding someone else's cart into a half-rung one would put two
      // people's flowers on one receipt.
      cart().addItem(makeCatalogItem({ variant_id: 99, quantity: 5 }), 2);
      cart().restore({
        lines: cartLinesFromParked({ items: [parkedItem()] }),
        cartDiscount: { type: 'percent', value: 10 },
        customer: null,
      });

      expect(cart().lines.map((l) => l.variant_id)).toEqual([42]);
      expect(cart().cartDiscount).toEqual({ type: 'percent', value: 10 });
    });

    it('a cart parked without a discount clears the one on screen', () => {
      cart().setCartDiscount({ type: 'fixed', value: 5000 });
      cart().restore({ lines: cartLinesFromParked({ items: [parkedItem()] }) });

      expect(cart().cartDiscount).toBeNull();
      expect(cart().customer).toBeNull();
    });
  });

  it('clear() wipes lines, banner, discount and customer', () => {
    cart().addItem(makeCatalogItem({ quantity: 0 }));
    cart().addItem(makeCatalogItem());
    cart().setCartDiscount({ type: 'percent', value: 10 });
    cart().setCustomer({
      id: 1,
      store_id: 1,
      name: 'Клієнт',
      phone: '+380000000000',
      email: null,
      children_birthdays: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    cart().clear();

    expect(cart()).toMatchObject({ lines: [], banner: null, cartDiscount: null, customer: null });
  });
});
