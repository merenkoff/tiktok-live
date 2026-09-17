// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Turning a parked cart back into what the sell screen draws
 * (`TechDocs/POS_FLORIST_BENCH.md` §9).
 *
 * Here rather than next to the store because it is pure, and because the store
 * module is a singleton: anything importing it outside `@pos/platform` gets a
 * second copy of the cart, which `check-platform-boundary.mjs` refuses.
 */

import type { CartLine, CartLineComponent } from '../hooks/useCart';

/**
 * `max_quantity` is what was parked, not what the shelf holds: the reserve
 * behind this cart covers exactly these flowers, and letting the cashier raise
 * a restored line would spend stock nobody checked. Adding more is what the
 * catalog is for, and that goes through `addItem`, which does check.
 */
export function cartLinesFromParked(cart: {
  items: Array<{
    id: number;
    variant_id: number;
    quantity: number;
    product_name: string;
    label: string;
    unit: string;
    line_price_cents: number;
    image_url: string | null;
    components: CartLineComponent[] | null;
  }>;
}): CartLine[] {
  return cart.items.map((item) => ({
    // A parked bouquet keeps a line of its own for the same reason it did at
    // the counter: two custom bouquets are two bouquets.
    uid: item.components?.length ? `bouquet:parked-${item.id}` : String(item.variant_id),
    variant_id: item.variant_id,
    product_name: item.product_name,
    variant_label: item.label,
    unit: item.unit,
    unit_price_cents: item.line_price_cents,
    quantity: item.quantity,
    max_quantity: item.quantity,
    image_url: item.image_url,
    ...(item.components?.length ? { components: item.components } : {}),
  }));
}
