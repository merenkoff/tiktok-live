// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Weighed lines in the cart (TechDocs/grocery/G4_WEIGHED.md): one line per
// weighing, never merged, never capped by stock, priced with the server's own
// sum — and refused through `addItem`, so a catalog that predates weights
// cannot ring a price per kilogram as «1».

import { beforeEach, describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../test/utils';
import { cartItemCount, cartLineCents, computeCartDiscountCents, useCartStore } from './useCart';

const cart = () => useCartStore.getState();

/** Hard cheese at 189,90 ₴ per kilogram, counted in grams. */
const cheese = (overrides = {}) =>
  makeCatalogItem({
    variant_id: 70,
    product_name: 'Сир твердий',
    label: 'Гауда',
    attributes: {},
    unit: 'г',
    price_cents: 18990,
    price_per: 1000,
    quantity: 2350,
    ...overrides,
  });

const bread = () => makeCatalogItem({ variant_id: 71, product_name: 'Хліб', label: '', unit: 'шт', price_cents: 4590, quantity: 10 });

describe('a weighed line in the cart', () => {
  beforeEach(() => cart().clear());

  it('goes in as its grams at the price per kilogram, marked as typed by hand', () => {
    expect(cart().addWeighed(cheese(), 350)).toBeNull();
    const [line] = cart().lines;
    expect(line).toMatchObject({
      variant_id: 70,
      quantity: 350,
      unit: 'г',
      unit_price_cents: 18990,
      price_per: 1000,
      weight_source: 'manual',
    });
    // 0,350 кг × 189,90 = 66,465 → 66,47 — the server's sum, not 350 × 189,90.
    expect(cart().subtotalCents()).toBe(6647);
    expect(cart().totalCents()).toBe(6647);
  });

  it('keeps every weighing its own line — two weighings never merge', () => {
    cart().addWeighed(cheese(), 350);
    cart().addWeighed(cheese(), 200);
    expect(cart().lines).toHaveLength(2);
    expect(new Set(cart().lines.map((l) => l.uid)).size).toBe(2);
    // R(350) + R(200) = 6647 + 3798, which is what the receipt will say line by line.
    expect(cart().subtotalCents()).toBe(6647 + 3798);
    // A weighing is one item, whatever it weighs.
    expect(cart().itemCount()).toBe(2);
  });

  it('is never capped by the shelf, nor refused at zero stock', () => {
    expect(cart().addWeighed(cheese({ quantity: 0 }), 5000)).toBeNull();
    expect(cart().addWeighed(cheese({ quantity: -900 }), 1200)).toBeNull();
    expect(cart().lines.map((l) => l.quantity)).toEqual([5000, 1200]);
  });

  it('refuses a weighed variant through addItem — a price per kilogram is not «1» of anything', () => {
    cart().addItem(cheese());
    expect(cart().lines).toHaveLength(0);
    expect(cart().banner).toMatch(/на вагу/);
  });

  it('refuses a weight the server would refuse, in its words', () => {
    expect(cart().addWeighed(cheese(), 0)).toBe('Введіть вагу');
    expect(cart().addWeighed(cheese(), 1_000_000)).toMatch(/999,999/);
    expect(cart().addWeighed(cheese({ price_cents: 499 }), 1)).toMatch(/0,00/);
    expect(cart().addWeighed(cheese(), 12.5)).toMatch(/до грама/);
    expect(cart().addWeighed(bread(), 350)).toMatch(/поштучно/);
    expect(cart().lines).toHaveLength(0);
  });

  it('takes a new weight from the pad instead of «+1 г»', () => {
    cart().addWeighed(cheese(), 350);
    const uid = cart().lines[0]!.uid;
    cart().setQty(uid, 500);
    expect(cart().lines[0]!.quantity).toBe(500);
    expect(cart().subtotalCents()).toBe(9495);
    // A weight the server would refuse leaves the line as it was.
    cart().setQty(uid, 2_000_000);
    expect(cart().lines[0]!.quantity).toBe(500);
    expect(cart().banner).toMatch(/999,999/);
    // Zero still removes it, like any line.
    cart().setQty(uid, 0);
    expect(cart().lines).toHaveLength(0);
  });

  it('shares a cart discount over the weighed sum, as the server does', () => {
    cart().addWeighed(cheese(), 350);
    cart().addItem(bread(), 2);
    // Eligible: 6647 + 9180 = 15827; 10 % of it, rounded = 1583.
    expect(computeCartDiscountCents(cart().lines, { type: 'percent', value: 10 })).toBe(1583);
    cart().setCartDiscount({ type: 'percent', value: 10 });
    expect(cart().totalCents()).toBe(15827 - 1583);
    // Two loaves and one weighing.
    expect(cart().itemCount()).toBe(3);
  });

  it('counts and sums lines that carry no basis as pieces, as before', () => {
    const plain = { quantity: 3, unit_price_cents: 4590 };
    expect(cartLineCents(plain)).toBe(13770);
    expect(cartItemCount([plain, { quantity: 350, price_per: 1000 }])).toBe(4);
  });
});
