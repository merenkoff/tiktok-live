// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Putting a pre-order on the till for hand-over
 * (`TechDocs/POS_FLORIST_BENCH.md` §14).
 *
 * A sibling of `parkedCart.ts` and pure for the same reason: the cart store is
 * a singleton, and anything importing it outside `@pos/platform` gets a second
 * copy of the cart.
 *
 * The price here is the **locked** one — what the shop promised, which is not
 * what the catalogue says today. The server rings the order from its own table
 * and ignores anything the till might send, so these numbers are for the
 * cashier to read, never for the receipt to be built from.
 */

import type { CartLine } from '../hooks/useCart';
import type { Preorder } from '../types';

export function cartLinesFromPreorder(order: Preorder): CartLine[] {
  return order.items.map((item) => ({
    // Its own uid per line: a pre-order's roses and a walk-in's are priced
    // differently, and merging them would silently pick one of the two prices.
    uid: `preorder:${order.id}:${item.id}`,
    variant_id: item.variant_id,
    product_name: item.product_name,
    variant_label: item.label,
    unit: item.unit,
    unit_price_cents: item.unit_price_cents,
    quantity: item.quantity,
    // Equal to the quantity: a promise is not a cart, and the sell screen hides
    // every edit control while one is on the till anyway.
    max_quantity: item.quantity,
    image_url: item.image_url,
    ...(item.components?.length
      ? {
          components: item.components.map((c) => ({
            component_variant_id: c.component_variant_id,
            quantity: c.quantity,
            // The stems' own names are not needed to ring it — the server
            // snapshots the composition from the order itself.
            product_name: '',
            label: '',
            unit: '',
            unit_price_cents: 0,
          })),
        }
      : {}),
  }));
}
