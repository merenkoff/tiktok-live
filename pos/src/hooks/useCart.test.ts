// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../test/utils';
import { computeCartDiscountCents, useCartStore, type CartLine } from './useCart';

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    variant_id: 1,
    product_name: 'Футболка',
    variant_label: 'Синій / M',
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

  it('builds the variant label from colour and size', () => {
    cart().addItem(makeCatalogItem({ color: 'Синій', size: 'M' }));
    expect(cart().lines[0].variant_label).toBe('Синій / M');
  });

  it('clamps setQty to the stock ceiling and warns', () => {
    cart().addItem(makeCatalogItem({ quantity: 3 }), 1);
    cart().setQty(1, 9);

    expect(cart().lines[0].quantity).toBe(3);
    expect(cart().banner).toBe('Недостатньо залишку');
  });

  it('drops a line set to zero', () => {
    cart().addItem(makeCatalogItem());
    cart().setQty(1, 0);

    expect(cart().lines).toEqual([]);
  });

  it('leaves other lines alone when changing one', () => {
    cart().addItem(makeCatalogItem({ variant_id: 1 }));
    cart().addItem(makeCatalogItem({ variant_id: 2 }));
    cart().setQty(2, 3);

    expect(cart().lines.map((l) => [l.variant_id, l.quantity])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('removes a line by variant', () => {
    cart().addItem(makeCatalogItem({ variant_id: 1 }));
    cart().addItem(makeCatalogItem({ variant_id: 2 }));
    cart().remove(1);

    expect(cart().lines.map((l) => l.variant_id)).toEqual([2]);
  });

  it('subtracts the cart discount from the total but never below zero', () => {
    cart().addItem(makeCatalogItem({ price_cents: 10000, quantity: 5 }), 2);
    cart().setCartDiscount({ type: 'fixed', value: 5000 });

    expect(cart().cartDiscountCents()).toBe(5000);
    expect(cart().totalCents()).toBe(15000);

    cart().setCartDiscount({ type: 'percent', value: 100 });
    expect(cart().totalCents()).toBe(0);
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
