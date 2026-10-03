// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product card's two halves (C1e): what the server has and what the owner
// typed, and the comparison that decides which rows are written at all.

import { describe, expect, it } from 'vitest';
import type { Product, ProductVariant } from '@pos/platform';
import {
  centsToInput,
  diffProduct,
  draftOf,
  isDirty,
  rowName,
  variantChanged,
  variantDraftOf,
  variantPayload,
} from './productDraft';

function variant(over: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 70,
    product_id: 7,
    attributes: { color: 'блакитний', size: '86' },
    label: 'блакитний / 86',
    unit: 'шт',
    sku: 'KZ-86',
    barcode: '2900000000070',
    price_cents: 40000,
    cost_cents: 0,
    compare_at_cents: null,
    is_active: true,
    quantity: 2,
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 7,
    name: 'Костюмчик Зайчик',
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: [2, 1],
    variants: [variant(), variant({ id: 71, label: 'блакитний / 92', attributes: { color: 'блакитний', size: '92' } })],
    ...over,
  } as Product;
}

describe('centsToInput', () => {
  it('writes whole hryvnias without kopiykas and keeps two places otherwise', () => {
    expect(centsToInput(40000)).toBe('400');
    expect(centsToInput(40050)).toBe('400.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(0)).toBe('0');
  });
});

describe('draftOf — the one place that reads a raw product', () => {
  it('normalises what an older payload may lack, and keeps only active variants', () => {
    const d = draftOf(
      product({
        composition: undefined,
        allergens: undefined,
        modifier_group_ids: undefined,
        sellable: undefined,
        variants: [variant(), variant({ id: 99, is_active: false })],
      })
    );
    expect(d.description).toBe('');
    expect(d.composition).toBe('');
    expect(d.allergens).toEqual([]);
    expect(d.groupIds).toEqual([]);
    expect(d.sellable).toBe(true);
    expect(d.shape).toBe('');
    expect(d.variants.map((v) => v.id)).toEqual([70]);
  });

  it('reads a variant as text the owner can type over, and «not said» cost as empty', () => {
    const v = variantDraftOf(variant({ cost_cents: 12050, pack_qty: 12, pack_label: 'ящик', compare_at_cents: 50000 }));
    expect(v.price).toBe('400');
    expect(v.cost).toBe('120.50');
    expect(v.compareAtCents).toBe(50000);
    expect(v.pack).toEqual({ qty: '12', label: 'ящик' });
    expect(variantDraftOf(variant()).cost).toBe('');
    expect(variantDraftOf(variant({ sku: null, barcode: null })).sku).toBe('');
  });

  it('names a row by its caption, or «Варіант» when it has none', () => {
    expect(rowName({ label: 'блакитний / 86' })).toBe('блакитний / 86');
    expect(rowName({ label: '' })).toBe('Варіант');
  });
});

describe('variantChanged — by what the text means', () => {
  const base = variantDraftOf(variant());

  it('ignores a different spelling of the same price, and whitespace around a code', () => {
    expect(variantChanged(base, { ...base, price: '400,00' })).toBe(false);
    expect(variantChanged(base, { ...base, price: '400.0' })).toBe(false);
    expect(variantChanged(base, { ...base, sku: ' KZ-86 ' })).toBe(false);
    expect(variantChanged(base, { ...base, cost: '0' })).toBe(false);
  });

  it('sees every field the server stores', () => {
    expect(variantChanged(base, { ...base, price: '450' })).toBe(true);
    expect(variantChanged(base, { ...base, cost: '120' })).toBe(true);
    expect(variantChanged(base, { ...base, compareAtCents: 50000 })).toBe(true);
    expect(variantChanged(base, { ...base, sku: 'KZ-92' })).toBe(true);
    expect(variantChanged(base, { ...base, barcode: '' })).toBe(true);
    expect(variantChanged(base, { ...base, unit: 'г' })).toBe(true);
    expect(variantChanged(base, { ...base, pack: { qty: '12', label: 'ящик' } })).toBe(true);
    expect(variantChanged(base, { ...base, attributes: { color: 'рожевий', size: '86' } })).toBe(true);
    expect(variantChanged(base, { ...base, attributes: { color: 'блакитний', size: '86', fit: '' } })).toBe(false);
    expect(variantChanged(base, { ...base, components: [{ component_variant_id: 1, quantity: 2 }] })).toBe(true);
  });
});

describe('variantPayload — the whole row, as the server replaces it', () => {
  const v = { ...variantDraftOf(variant()), cost: '120', components: [{ component_variant_id: 1, quantity: 2 }] };

  it('sends the composition only for a composite, and an empty one to clear it', () => {
    expect(variantPayload(v, 'keep').components).toEqual([{ component_variant_id: 1, quantity: 2 }]);
    expect(variantPayload(v, 'clear').components).toEqual([]);
    expect(variantPayload(v, 'omit')).not.toHaveProperty('components');
  });

  it('parses the text once, clears an emptied code, and sends the pack as a pair', () => {
    const body = variantPayload({ ...v, sku: '', pack: { qty: '', label: '' } }, 'omit');
    expect(body).toMatchObject({ price_cents: 40000, cost_cents: 12000, sku: '', pack_qty: null, pack_label: '' });
    expect(variantPayload({ ...v, pack: { qty: '12', label: 'ящик' } }, 'omit')).toMatchObject({
      pack_qty: 12,
      pack_label: 'ящик',
    });
  });
});

describe('diffProduct — what a save has to write', () => {
  const snapshot = draftOf(product());

  it('is clean against itself', () => {
    expect(isDirty(diffProduct(snapshot, snapshot))).toBe(false);
  });

  it('flags each class once, and lists only the rows that changed', () => {
    const d = diffProduct(snapshot, {
      ...snapshot,
      name: 'Зайчик',
      variants: [snapshot.variants[0]!, { ...snapshot.variants[1]!, price: '450' }],
    });
    expect(d.details).toBe(true);
    expect(d.shape).toBe(false);
    expect(d.tags).toBe(false);
    expect(d.groups).toBe(false);
    expect(d.variants.map((v) => v.id)).toEqual([71]);
    expect(isDirty(d)).toBe(true);
  });

  it('reads tags as a set and modifier groups as an ordered list', () => {
    expect(diffProduct(snapshot, { ...snapshot, tagIds: [1, 2] }).tags).toBe(false);
    expect(diffProduct(snapshot, { ...snapshot, tagIds: [1] }).tags).toBe(true);
    const asked = { ...snapshot, groupIds: [3, 4] };
    expect(diffProduct(asked, { ...asked, groupIds: [4, 3] }).groups).toBe(true);
  });

  it('sees the shape, the photo and the sell-screen switch', () => {
    expect(diffProduct(snapshot, { ...snapshot, shape: 'own' }).shape).toBe(true);
    expect(diffProduct(snapshot, { ...snapshot, imageUrl: '/pos-uploads/a.jpg' }).details).toBe(true);
    expect(diffProduct(snapshot, { ...snapshot, sellable: false }).details).toBe(true);
  });
});
