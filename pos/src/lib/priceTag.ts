// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The price-tag payload.
 *
 * Deliberately shaped like `buildReceiptPayload` in `receipt.ts`: one pure
 * function producing the data, and rendering left to whoever is printing. The
 * receipt is rendered twice — as ESC/POS in `receipt.rs` and as HTML in
 * `ReceiptPrintable.tsx` — and it is the *payload* being shared that keeps
 * those two honest. Price tags start with the HTML renderer only; when the
 * ESC/POS one arrives (the `escpos` crate already has a native EAN-13 command)
 * it consumes this same array.
 */

import { isEan13 } from './ean13';
import type { Product, ProductVariant } from '../types';

export type PriceTag = {
  storeName: string;
  productName: string;
  /** The variant's caption ("Рожевий · 98/104"), or empty when it has none. */
  variantLabel: string;
  priceCents: number;
  sku: string | null;
  /** Only ever a printable EAN-13; anything else is reported as missing. */
  barcode: string | null;
  /** How many copies of this tag to print. */
  copies: number;
};

export type PriceTagSource = {
  product: Pick<Product, 'name'>;
  variant: Pick<
    ProductVariant,
    'id' | 'label' | 'unit' | 'price_cents' | 'sku' | 'barcode' | 'quantity'
  >;
  /** Overrides the stock-derived default. */
  copies?: number;
};

/**
 * The caption printed under the product name. It is the variant's stored
 * `label` — the store's vertical built it, and a tag that disagreed with the
 * till and the receipt would be its own kind of bug.
 */
export function variantLabel(variant: Pick<ProductVariant, 'label'>): string {
  return variant.label.trim();
}

/**
 * How many tags an item gets by default.
 *
 * One per unit on hand: a rail of five pyjamas needs five tags. Zero stock
 * still gets one — the operator is often tagging something before receiving it,
 * and printing nothing would look like a bug.
 *
 * Only for goods counted in pieces. "600 tags for 600 grams of coffee" is not a
 * default anyone wants, so anything else starts at one and the operator says
 * how many they need.
 */
export function defaultCopies(quantity: number, unit = 'шт'): number {
  if (unit !== 'шт') return 1;
  return Math.max(1, Math.floor(quantity) || 0);
}

export function buildPriceTags(storeName: string, items: PriceTagSource[]): PriceTag[] {
  return items.map(({ product, variant, copies }) => ({
    storeName,
    productName: product.name.trim(),
    variantLabel: variantLabel(variant),
    priceCents: variant.price_cents,
    sku: variant.sku?.trim() || null,
    // A tag whose barcode cannot be drawn is still a useful tag — it just has
    // no bars. Silently printing a mangled one would be worse.
    barcode: variant.barcode && isEan13(variant.barcode.trim()) ? variant.barcode.trim() : null,
    copies:
      copies == null
        ? defaultCopies(variant.quantity, variant.unit)
        : Math.max(0, Math.floor(copies)),
  }));
}

/** Flatten to one entry per physical tag, ready to map into pages. */
export function expandCopies(tags: PriceTag[]): PriceTag[] {
  return tags.flatMap((tag) => Array.from({ length: tag.copies }, () => tag));
}
