// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What a cart row shows — shared by the desktop sidebar and the phone's cart
 * sheet, which draw the same lines and used to compute them twice.
 *
 * A weighed line (TechDocs/grocery/G4_WEIGHED.md) reads «0,350 кг × 189,90
 * ₴/кг» and costs `lineAmountCents` of its grams — never «×350», which would
 * read as 350 pieces at the price of a kilogram.
 */

import type { CartLine } from '@pos/platform';
import { cartLineCents } from '@pos/platform';
import { lineAmountCents } from '../../lib/lineMoney';
import { formatUah } from '../../lib/money';
import { isWeighed, weighedLineCaption } from '../../lib/weighed';

export interface CartLineView {
  /** What the line comes to before the cart discount. */
  total: number;
  /** The same weight or count at the old price, when the card is marked down. */
  compareTotal: number | null;
  /** The row's second line: the caption, and how much at what. */
  caption: string;
  weighed: boolean;
  /** The weight was typed from a plain scale — the receipt says so too. */
  manual: boolean;
}

export function cartLineView(line: CartLine): CartLineView {
  const weighed = isWeighed(line.price_per);
  const per = line.price_per ?? 1;
  const amount = weighed
    ? weighedLineCaption(line.quantity, line.unit, per, line.unit_price_cents)
    : line.quantity > 1
      ? `${line.quantity} × ${formatUah(line.unit_price_cents)}`
      : null;
  return {
    total: cartLineCents(line),
    compareTotal: line.compare_at_cents != null ? lineAmountCents(line.quantity, line.compare_at_cents, per) : null,
    caption: [line.variant_label, amount].filter(Boolean).join(' · '),
    weighed,
    manual: weighed && line.weight_source === 'manual',
  };
}
