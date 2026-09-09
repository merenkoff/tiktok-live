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
  /** "98/104 · Рожевий", or empty when the variant has neither. */
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
  variant: Pick<ProductVariant, 'id' | 'size' | 'color' | 'price_cents' | 'sku' | 'barcode' | 'quantity'>;
  /** Overrides the stock-derived default. */
  copies?: number;
};

export function variantLabel(variant: Pick<ProductVariant, 'size' | 'color'>): string {
  return [variant.color, variant.size].map((s) => s.trim()).filter(Boolean).join(' · ');
}

/**
 * How many tags an item gets by default.
 *
 * One per unit on hand: a rail of five pyjamas needs five tags. Zero stock
 * still gets one — the operator is often tagging something before receiving it,
 * and printing nothing would look like a bug.
 */
export function defaultCopies(quantity: number): number {
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
    copies: copies == null ? defaultCopies(variant.quantity) : Math.max(0, Math.floor(copies)),
  }));
}

/** Flatten to one entry per physical tag, ready to map into pages. */
export function expandCopies(tags: PriceTag[]): PriceTag[] {
  return tags.flatMap((tag) => Array.from({ length: tag.copies }, () => tag));
}
