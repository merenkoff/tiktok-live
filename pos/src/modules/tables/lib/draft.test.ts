// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '@pos/platform';
import { countsByProduct, draftSummary, draftView, pendingLine, previewCents } from './draft';
import type { BillLine } from './types';

const MILK = {
  id: 3,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 31, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: null, component_quantity: null },
    { id: 32, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const item = (over: Partial<CatalogItem> = {}): CatalogItem =>
  ({
    variant_id: 5,
    product_id: 1,
    product_name: 'Латте',
    attributes: { size: 'M' },
    label: 'M',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 6500,
    quantity: 10,
    image_url: null,
    modifier_groups: [MILK],
    tag_ids: [],
    ...over,
  }) as CatalogItem;

const latteM = item();
const latteL = item({ variant_id: 6, label: 'L', price_cents: 8500 });
const croissant = item({ variant_id: 9, product_id: 2, product_name: 'Круасан', label: '', price_cents: 5500, modifier_groups: [] });

const serverLine = (over: Partial<BillLine> = {}): BillLine => ({
  id: 3,
  variant_id: 9,
  quantity: 2,
  product_name: 'Круасан',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: null,
  compare_at_unit_cents: null,
  preview_unit_price_cents: 5500,
  components: null,
  modifiers: [],
  note: '',
  sale_id: null,
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
  ...over,
});

describe('previewCents', () => {
  it('is the card price plus the deltas of the answers', () => {
    expect(previewCents(latteM, [31])).toBe(6500);
    expect(previewCents(latteM, [32])).toBe(8000);
    expect(previewCents(croissant, [])).toBe(5500);
  });

  it('is unknown for answers the dish does not have', () => {
    expect(previewCents(latteM, [99])).toBeNull();
  });
});

describe('pendingLine', () => {
  it('carries the server’s merge key, the names and the preview', () => {
    const line = pendingLine({ item: latteM, modifiers: [32], note: 'гарячіше' }, 't1');
    expect(line).toMatchObject({
      token: 't1',
      uid: '5|32|гарячіше',
      variant_id: 5,
      product_id: 1,
      quantity: 1,
      modifiers: [32],
      modifierNames: ['вівсяне'],
      note: 'гарячіше',
      preview_cents: 8000,
    });
    // A bare line keys on the variant alone, exactly as the cart does.
    expect(pendingLine({ item: croissant, modifiers: [], note: '' }, 't2').uid).toBe('9');
  });
});

describe('draftView', () => {
  it('folds a tap into the server line it will merge with', () => {
    const view = draftView([serverLine()], [pendingLine({ item: croissant, modifiers: [], note: '' }, 't1')]);
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ id: 3, quantity: 3, pending: true, product_id: 2 });
  });

  it('keeps a note, and a different answer, as their own lines', () => {
    const view = draftView(
      [serverLine({ id: 4, variant_id: 5, quantity: 1, product_name: 'Латте', variant_label: 'M', modifiers: [{ modifier_id: 31, group_name: 'Молоко', name: 'звичайне', price_delta_cents: 0, sort_order: 0 }], preview_unit_price_cents: 6500 })],
      [
        pendingLine({ item: latteM, modifiers: [31], note: '' }, 'a'),
        pendingLine({ item: latteM, modifiers: [32], note: '' }, 'b'),
        pendingLine({ item: latteM, modifiers: [31], note: 'без піни' }, 'c'),
      ]
    );
    expect(view.map((r) => [r.id, r.quantity, r.pending])).toEqual([
      [4, 2, true],
      [null, 1, true],
      [null, 1, true],
    ]);
    expect(view[1].modifierNames).toEqual(['вівсяне']);
    expect(view[2].note).toBe('без піни');
  });

  it('adds two taps on the same new dish into one row, in tap order', () => {
    const view = draftView(
      [serverLine()],
      [pendingLine({ item: latteL, modifiers: [31], note: '' }, 'a'), pendingLine({ item: latteL, modifiers: [31], note: '' }, 'b')]
    );
    expect(view.map((r) => [r.key, r.quantity])).toEqual([
      ['srv:3', 2],
      ['pend:6|31|', 2],
    ]);
  });

  it('leaves the server draft alone when nothing is pending', () => {
    const view = draftView([serverLine()], []);
    expect(view[0]).toMatchObject({ id: 3, quantity: 2, pending: false, preview_unit_cents: 5500 });
  });
});

describe('countsByProduct', () => {
  const grouped: Array<[number, CatalogItem[]]> = [
    [1, [latteM, latteL]],
    [2, [croissant]],
  ];

  it('counts per dish across its sizes, pending taps included', () => {
    const view = draftView(
      [serverLine({ id: 4, variant_id: 5, product_name: 'Латте', variant_label: 'M', quantity: 1 }), serverLine()],
      [pendingLine({ item: latteL, modifiers: [31], note: '' }, 'a')]
    );
    const counts = countsByProduct(view, grouped);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(2);
  });

  it('counts nothing for a line whose dish is not on the menu any more', () => {
    const view = draftView([serverLine({ variant_id: 77 })], []);
    expect(countsByProduct(view, grouped).size).toBe(0);
  });
});

describe('draftSummary', () => {
  it('sums lines and units, and says «≈» once a line has no preview', () => {
    const exact = draftSummary(draftView([serverLine()], [pendingLine({ item: latteM, modifiers: [32], note: '' }, 'a')]));
    expect(exact).toEqual({ lines: 2, units: 3, cents: 19000, exact: true });

    const fuzzy = draftSummary(draftView([serverLine({ preview_unit_price_cents: null })], []));
    expect(fuzzy).toEqual({ lines: 1, units: 2, cents: 0, exact: false });
  });
});
