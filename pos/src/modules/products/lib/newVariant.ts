// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { uahInputToCents } from '@pos/platform';
import type { AttributeValues, ProductComponentInput } from '@pos/platform';
import type { ProductShape } from './productShape';

/** Everything one NEW variant is typed as — text, parsed once when it is sent. */
export interface NewVariantValues {
  attributes: AttributeValues;
  unit: string;
  price: string;
  qty: string;
  sku: string;
  barcode: string;
  pack: { qty: string; label: string };
  components: ProductComponentInput[];
}

export function emptyVariant(unit: string): NewVariantValues {
  return { attributes: {}, unit, price: '', qty: '1', sku: '', barcode: '', pack: { qty: '', label: '' }, components: [] };
}

/** Whether anything was typed into the one-variant form beyond its blank start. */
export function singleTyped(v: NewVariantValues, defaultUnit: string): boolean {
  return (
    Object.keys(v.attributes).length > 0 ||
    v.unit !== defaultUnit ||
    v.price.trim() !== '' ||
    v.qty.trim() !== '1' ||
    v.sku.trim() !== '' ||
    v.barcode.trim() !== '' ||
    v.pack.qty.trim() !== '' ||
    v.pack.label.trim() !== '' ||
    v.components.length > 0
  );
}

/** The body `POST /products/:id/variants` and a `createProduct` row take. */
export function newVariantInput(v: NewVariantValues, shape: ProductShape) {
  return {
    attributes: v.attributes,
    unit: v.unit,
    sku: v.sku.trim() || undefined,
    barcode: v.barcode.trim() || undefined,
    price_cents: uahInputToCents(v.price),
    // A derived composite keeps no stock of its own; the server refuses an
    // opening quantity on one rather than silently dropping it.
    quantity: shape === 'derived' ? 0 : Number(v.qty) || 0,
    pack_qty: v.pack.qty.trim() === '' ? null : Number(v.pack.qty),
    pack_label: v.pack.label.trim() === '' ? null : v.pack.label,
    ...(shape ? { components: v.components } : {}),
  };
}

