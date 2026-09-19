// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till prices a line with modifiers with the same arithmetic, the same
// caption and the same refusals as the server. The cases here are the ones
// `src/__tests__/pos.modifiers.test.ts` pins on the server side; a change to
// either file is a change to both.

import { describe, expect, it } from 'vitest';
import type { CatalogModifierGroup } from '../types';
import { makeCatalogItem } from '../test/utils';
import {
  MAX_LINE_NOTE,
  cartLineUid,
  cleanLineNote,
  defaultModifierIds,
  groupsOf,
  lineCaption,
  needsModifierSheet,
  normalizeModifierIds,
  resolveLineModifiers,
  shiftCompareAt,
} from './modifiers';

const milk: CatalogModifierGroup = {
  id: 1,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 11, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: 501, component_quantity: 200 },
    { id: 12, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: 502, component_quantity: 200 },
  ],
};

const syrup: CatalogModifierGroup = {
  id: 2,
  name: 'Сироп',
  min_select: 0,
  max_select: 3,
  modifiers: [
    { id: 21, name: 'карамель', price_delta_cents: 1000, is_default: false, component_variant_id: 601, component_quantity: 1 },
    { id: 22, name: 'ваніль', price_delta_cents: 1000, is_default: false, component_variant_id: 602, component_quantity: 1 },
    { id: 23, name: 'лісовий горіх', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const shot: CatalogModifierGroup = {
  id: 3,
  name: 'Порція',
  min_select: 0,
  max_select: 1,
  modifiers: [
    { id: 31, name: 'подвійна', price_delta_cents: 2000, is_default: false, component_variant_id: 700, component_quantity: 18 },
    { id: 32, name: 'половина', price_delta_cents: -2000, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const groups = [milk, syrup, shot];

describe('resolveLineModifiers', () => {
  it('sums signed deltas and names the answers in group order, whatever order the ids came in', () => {
    // 6500 + 1500 (oat) + 1000 (caramel) − 2000 (half shot) = 7000 on the server.
    const r = resolveLineModifiers(groups, [32, 21, 12]);
    expect(r.error).toBeNull();
    expect(r.deltaCents).toBe(500);
    expect(6500 + r.deltaCents).toBe(7000);
    expect(r.names).toEqual(['вівсяне', 'карамель', 'половина']);
    expect(r.snapshot.map((m) => m.id)).toEqual([12, 21, 32]);
    expect(r.snapshot[0]).toEqual({ id: 12, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 });
  });

  it('aggregates what the answers write off, per variant, and skips an answer with no component', () => {
    const r = resolveLineModifiers(groups, [12, 21, 23, 31]);
    expect(r.components).toEqual([
      { component_variant_id: 502, quantity: 200 },
      { component_variant_id: 601, quantity: 1 },
      { component_variant_id: 700, quantity: 18 },
    ]);
  });

  it('refuses a required group left unanswered, in the server’s words', () => {
    expect(resolveLineModifiers(groups, []).error).toBe('Оберіть «Молоко»');
    expect(resolveLineModifiers(groups, [21]).error).toBe('Оберіть «Молоко»');
    const two = { ...milk, min_select: 2, max_select: 2 };
    expect(resolveLineModifiers([two], [11]).error).toBe('«Молоко»: оберіть щонайменше 2');
  });

  it('refuses more answers than the group takes', () => {
    const r = resolveLineModifiers(groups, [11, 21, 22, 23, 31]);
    expect(r.error).toBeNull();
    const over = resolveLineModifiers([milk, { ...syrup, max_select: 2 }], [11, 21, 22, 23]);
    expect(over.error).toBe('«Сироп»: не більше 2');
    // The figures are still there next to the error, so the sheet can show a live price.
    expect(over.deltaCents).toBe(3000);
  });

  it('refuses an id that is not one of this product’s answers', () => {
    expect(resolveLineModifiers(groups, [11, 999]).error).toBe('Модифікатор 999 недоступний для цього товару');
  });

  it('is fine with no groups and no ids', () => {
    expect(resolveLineModifiers([], [])).toEqual({
      snapshot: [],
      deltaCents: 0,
      names: [],
      components: [],
      error: null,
    });
  });
});

describe('lineCaption', () => {
  it('composes label then answers with the server’s separator, and never the note', () => {
    expect(lineCaption('M', ['вівсяне', 'без цукру'])).toBe('M · вівсяне · без цукру');
    expect(lineCaption('', ['вівсяне'])).toBe('вівсяне');
    expect(lineCaption(' M ', [])).toBe('M');
  });

  it('is bounded like the column', () => {
    expect(lineCaption('x'.repeat(300), ['y']).length).toBe(255);
  });
});

describe('shiftCompareAt', () => {
  it('moves the old price by the delta and leaves null alone', () => {
    expect(shiftCompareAt(8000, 1500)).toBe(9500);
    expect(shiftCompareAt(8000, -2000)).toBe(6000);
    expect(shiftCompareAt(null, 1500)).toBeNull();
    expect(shiftCompareAt(undefined, 1500)).toBeNull();
  });
});

describe('cartLineUid', () => {
  it('keeps the bare variant id for a plain line, so existing uids do not move', () => {
    expect(cartLineUid(5, [], '')).toBe('5');
  });

  it('is the server’s merge key otherwise: sorted ids, then the note', () => {
    expect(cartLineUid(5, [9, 3], 'гарячіше')).toBe('5|3,9|гарячіше');
    expect(cartLineUid(5, [3, 9], 'гарячіше')).toBe(cartLineUid(5, [9, 3], 'гарячіше'));
    expect(cartLineUid(5, [], 'гарячіше')).toBe('5||гарячіше');
    expect(cartLineUid(5, [3], '')).not.toBe(cartLineUid(5, [3], 'x'));
  });
});

describe('normalizeModifierIds / cleanLineNote', () => {
  it('sorts, dedupes and drops what is not an id', () => {
    expect(normalizeModifierIds([9, 3, 9, 0, -1, 2.5])).toEqual([3, 9]);
    expect(normalizeModifierIds(undefined)).toEqual([]);
  });

  it('trims and caps the note at the column width', () => {
    expect(cleanLineNote('  гарячіше ')).toBe('гарячіше');
    expect(cleanLineNote(null)).toBe('');
    expect(cleanLineNote('x'.repeat(200)).length).toBe(MAX_LINE_NOTE);
  });
});

describe('defaults and the tap rule', () => {
  it('pre-selects the defaults per group, capped at what the group takes', () => {
    expect(defaultModifierIds(groups)).toEqual([11]);
    const twoDefaults = {
      ...syrup,
      max_select: 1,
      modifiers: syrup.modifiers.map((m) => ({ ...m, is_default: true })),
    };
    expect(defaultModifierIds([milk, twoDefaults])).toEqual([11, 21]);
  });

  it('does not open the sheet when every required group is answered by a default', () => {
    // «Лате як завжди» is one tap: milk defaults to plain, the syrup is optional.
    expect(needsModifierSheet([makeCatalogItem()], groups)).toBe(false);
    expect(needsModifierSheet([makeCatalogItem()], [])).toBe(false);
  });

  it('opens it for a required group without a default, or when there is a size to pick', () => {
    const noDefault = { ...milk, modifiers: milk.modifiers.map((m) => ({ ...m, is_default: false })) };
    expect(needsModifierSheet([makeCatalogItem()], [noDefault])).toBe(true);
    expect(needsModifierSheet([makeCatalogItem({ variant_id: 1 }), makeCatalogItem({ variant_id: 2 })], groups)).toBe(true);
  });

  it('reads the groups off whichever variant carries them', () => {
    const bare = makeCatalogItem({ variant_id: 1 });
    const carrying = makeCatalogItem({ variant_id: 2, modifier_groups: groups });
    expect(groupsOf([bare, carrying])).toBe(groups);
    expect(groupsOf([bare])).toEqual([]);
  });
});
