// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { useCartStore, computeCartDiscountCents } from '../hooks/useCart';
// `CartLineComponent` and `AssembledLineInput` are what the florist's bench
// hands back: one custom bouquet, its stems, and the price it was assembled
// for. The server re-prices from the stems and wins — see `addAssembled`.
export type {
  CartLine,
  CartDiscount,
  CartLineComponent,
  AssembledLineInput,
} from '../hooks/useCart';
