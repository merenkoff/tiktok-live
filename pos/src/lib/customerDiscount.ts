// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A regular customer's personal discount, as the till handles it
// (TechDocs/POS_CLOTHING.md, phase C0). Pure: no store, no React — the cart store
// and the components both import it, and keeping it out of `hooks/useCart.ts`
// means a component can use it without a second copy of the store coming along.

import type { CartDiscount } from '../hooks/useCart';
import type { PosCustomer } from '../types';

/**
 * The personal discount on a customer's card, in whole percent. Absent, null
 * or junk reads as none: a till that cached its customers before the field
 * existed has rows without it.
 */
export function customerDiscountPercent(customer: PosCustomer | null | undefined): number {
  const raw = customer?.discount_percent;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Whether `cartDiscount` is exactly what this customer's card gives, as
 * opposed to a one-off the cashier typed. Derived rather than flagged: the
 * discount travels to the server as a plain `{ type, value }` and comes back
 * from a parked cart the same way, so there is no marker to lose. A cashier's
 * own 10 % next to a 10 % customer is the same discount either way.
 */
export function isCustomerDiscount(
  cartDiscount: CartDiscount | null,
  customer: PosCustomer | null | undefined
): boolean {
  const percent = customerDiscountPercent(customer);
  return cartDiscount?.type === 'percent' && percent > 0 && cartDiscount.value === percent;
}

/**
 * What the cart's discount becomes when the customer changes.
 *
 * The three kinds of discount do not argue (TechDocs/guides): a product's own
 * markdown is never touched, and the cart carries ONE discount — the chosen
 * customer's, until the cashier puts a one-off of their own in its place, which
 * then stays. Only a discount that came from the previous customer (or none)
 * is replaced; taking the customer off removes just theirs.
 */
export function discountAfterCustomerChange(
  current: CartDiscount | null,
  previous: PosCustomer | null,
  next: PosCustomer | null
): CartDiscount | null {
  if (current !== null && !isCustomerDiscount(current, previous)) return current;
  const percent = customerDiscountPercent(next);
  return percent > 0 ? { type: 'percent', value: percent } : null;
}

/** «Знижка клієнта 10%» when the discount is the customer's, else the cashier's «Знижка на чек». */
export function cartDiscountLabel(
  cartDiscount: CartDiscount | null,
  customer: PosCustomer | null | undefined
): string {
  return isCustomerDiscount(cartDiscount, customer) && cartDiscount
    ? `Знижка клієнта ${cartDiscount.value}%`
    : 'Знижка на чек';
}
