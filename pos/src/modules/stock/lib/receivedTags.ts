// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Price tags from a posted receiving document (clothing L4): the lines folded
// into what `PriceTagsDialog` reads, plus how many of each variant arrived.
// Pure, so the page test and the dialog agree on one shape.

import type { StockDocumentLine } from '@pos/platform';
import type { PriceTagsDialogProduct } from '../../products/components/PriceTagsDialog';

export interface ReceivedTagSources {
  products: PriceTagsDialogProduct[];
  /** variant id → units received, summed should a variant ever sit on two lines. */
  byVariant: Map<number, number>;
}

/**
 * Only lines that resolved to a variant: a stub on a draft has no price, no
 * barcode and no label the shop would print. After posting every line has one.
 * `price_cents` and friends ride the line only from `getStockDocument`, so a
 * document loaded any other way yields no sources at all rather than tags
 * priced at zero.
 */
export function receivedTagSources(lines: ReadonlyArray<StockDocumentLine>): ReceivedTagSources {
  const products = new Map<number, PriceTagsDialogProduct>();
  const byVariant = new Map<number, number>();
  for (const line of lines) {
    if (line.variant_id == null || line.price_cents == null) continue;
    const productId = line.product_id ?? -line.variant_id;
    let product = products.get(productId);
    if (!product) {
      product = { id: productId, name: line.product_name ?? '', variants: [] };
      products.set(productId, product);
    }
    if (!byVariant.has(line.variant_id)) {
      product.variants.push({
        id: line.variant_id,
        label: line.label ?? '',
        unit: line.unit ?? 'шт',
        price_cents: line.price_cents,
        compare_at_cents: line.compare_at_cents ?? null,
        sku: line.sku ?? null,
        barcode: line.barcode ?? null,
        quantity: 0,
        is_active: line.is_active ?? true,
      });
    }
    byVariant.set(line.variant_id, (byVariant.get(line.variant_id) ?? 0) + Math.max(0, line.quantity));
  }
  return { products: [...products.values()], byVariant };
}
