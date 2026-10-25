// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { useCartStore, computeCartDiscountCents } from '../hooks/useCart';
// What one line comes to and how many goods the cart holds, the way the
// server counts them — a weighing is one line at grams × price per kilogram
// (platform 21, TechDocs/grocery/G4_WEIGHED.md). A module that totals the cart
// itself (the debts module's «Під запис») reads these, not `price × quantity`.
export { cartLineCents, cartItemCount } from '../hooks/useCart';
// `CartLineComponent` and `AssembledLineInput` are what the florist's bench
// hands back: one custom bouquet, its stems, and the price it was assembled
// for. The server re-prices from the stems and wins — see `addAssembled`.
export type {
  CartLine,
  CartDiscount,
  CartLineComponent,
  AssembledLineInput,
} from '../hooks/useCart';
