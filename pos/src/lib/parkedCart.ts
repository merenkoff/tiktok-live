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
import type { LineModifierSnapshot } from '../types';
import { cartLineUid, lineCaption } from './modifiers';

/**
 * The answers a line can be rung with again: the ones that still exist. A
 * deleted answer keeps its name on the caption (the customer asked for it)
 * but has no id to send, so checkout re-prices without it — a parked cart
 * is a shelf, not a promise; the promise is a pre-order.
 */
export function liveModifiers(
  snapshot: LineModifierSnapshot[] | null | undefined
): CartLine['modifiers'] {
  const live = (snapshot ?? []).filter(
    (m): m is LineModifierSnapshot & { modifier_id: number } => m.modifier_id != null
  );
  return live.length
    ? live.map((m) => ({
        id: m.modifier_id,
        group_name: m.group_name,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }))
    : undefined;
}

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
    modifiers?: LineModifierSnapshot[] | null;
    note?: string | null;
  }>;
}): CartLine[] {
  return cart.items.map((item) => {
    const modifiers = liveModifiers(item.modifiers);
    const note = item.note?.trim() ?? '';
    return {
      // A parked bouquet keeps a line of its own for the same reason it did at
      // the counter: two custom bouquets are two bouquets. A café line takes
      // the server's own merge key, so a walk-in latte with the same answers
      // and note lands on it rather than beside it.
      uid: item.components?.length
        ? `bouquet:parked-${item.id}`
        : cartLineUid(
            item.variant_id,
            (modifiers ?? []).map((m) => m.id),
            note
          ),
      variant_id: item.variant_id,
      product_name: item.product_name,
      // The caption names every answer as parked, deleted ones included.
      variant_label: lineCaption(item.label, (item.modifiers ?? []).map((m) => m.name)),
      unit: item.unit,
      // Already the card plus the answers' deltas, computed server-side.
      unit_price_cents: item.line_price_cents,
      quantity: item.quantity,
      max_quantity: item.quantity,
      image_url: item.image_url,
      ...(item.components?.length ? { components: item.components } : {}),
      ...(modifiers ? { modifiers } : {}),
      ...(note ? { note } : {}),
    };
  });
}
