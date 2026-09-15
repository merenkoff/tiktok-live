// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.nav-overrides.test.ts
//
// `sanitizeNavOverrides` — the gate on `pos_stores.nav_overrides`, the per-store
// menu appearance (label / icon / order per nav entry).
//
// Two things it is here to guarantee. It only ever lets *appearance* through:
// there is no field by which a stored override could add a menu entry, point
// one somewhere else, or run anything — the client looks up an override by the
// key of an entry it already has. And it is lenient about which entry a key
// names on purpose: the set of nav entries belongs to the client build, which
// this process does not know, so a store on a newer POS build (or one with an
// online-only module the backend has never heard of) must still be able to save
// its own menu.

import { describe, expect, it } from 'vitest';
import {
  NAV_LABEL_MAX,
  NAV_OVERRIDES_MAX,
  sanitizeNavOverrides,
} from '../pos/core/nav.js';

const KEY = 'catalog-checkout:cashier-primary:/register';

describe('sanitizeNavOverrides', () => {
  it('keeps a well-formed override', () => {
    expect(
      sanitizeNavOverrides({ [KEY]: { label: 'Продаж', icon: 'ShoppingCart', order: 20 } })
    ).toEqual({ [KEY]: { label: 'Продаж', icon: 'ShoppingCart', order: 20 } });
  });

  it('keeps a sparse override — an absent field means «keep the module value»', () => {
    expect(sanitizeNavOverrides({ [KEY]: { order: 0 } })).toEqual({ [KEY]: { order: 0 } });
  });

  it('drops anything that is not an object map', () => {
    for (const bad of [null, undefined, 'x', 42, [{ label: 'a' }]]) {
      expect(sanitizeNavOverrides(bad)).toEqual({});
    }
  });

  it('drops a key that is not <moduleId>:<location>:<path>', () => {
    const bad = {
      'catalog-checkout:/register': { label: 'a' },
      'catalog-checkout:sidebar:/register': { label: 'a' },
      'Catalog:cashier-primary:/register': { label: 'a' },
      'catalog-checkout:cashier-primary:register': { label: 'a' },
      'catalog-checkout:cashier-primary:/<script>': { label: 'a' },
      '': { label: 'a' },
    };
    expect(sanitizeNavOverrides(bad)).toEqual({});
  });

  it('accepts a key for a module this build has never heard of', () => {
    // An online-only module registered in `module_remotes`, or one shipped by a
    // newer client. The backend does not own the nav-entry list and must not
    // pretend to — an override that matches nothing is inert on every client.
    const key = 'loyalty:cashier-primary:/loyalty';
    expect(sanitizeNavOverrides({ [key]: { label: 'Бонуси' } })).toEqual({
      [key]: { label: 'Бонуси' },
    });
  });

  it('drops a value that is not an object, and an object with nothing usable', () => {
    expect(sanitizeNavOverrides({ [KEY]: 'Продаж' })).toEqual({});
    expect(sanitizeNavOverrides({ [KEY]: ['Продаж'] })).toEqual({});
    expect(sanitizeNavOverrides({ [KEY]: {} })).toEqual({});
    expect(sanitizeNavOverrides({ [KEY]: { colour: 'red', onClick: 'alert(1)' } })).toEqual({});
  });

  it('trims a label and refuses an empty or over-long one', () => {
    expect(sanitizeNavOverrides({ [KEY]: { label: '  Продаж  ' } })).toEqual({
      [KEY]: { label: 'Продаж' },
    });
    expect(sanitizeNavOverrides({ [KEY]: { label: '   ' } })).toEqual({});
    expect(sanitizeNavOverrides({ [KEY]: { label: 'x'.repeat(NAV_LABEL_MAX + 1) } })).toEqual({});
    expect(sanitizeNavOverrides({ [KEY]: { label: 'x'.repeat(NAV_LABEL_MAX) } })).toEqual({
      [KEY]: { label: 'x'.repeat(NAV_LABEL_MAX) },
    });
  });

  it('accepts only a bare lucide export name as an icon', () => {
    expect(sanitizeNavOverrides({ [KEY]: { icon: 'ShoppingCart' } })).toEqual({
      [KEY]: { icon: 'ShoppingCart' },
    });
    for (const icon of ['<svg>', 'Shopping Cart', 'https://evil.test/x.svg', '../x', '']) {
      expect(sanitizeNavOverrides({ [KEY]: { icon } })).toEqual({});
    }
  });

  it('accepts only an integer order, within range', () => {
    expect(sanitizeNavOverrides({ [KEY]: { order: -10 } })).toEqual({ [KEY]: { order: -10 } });
    for (const order of [1.5, NaN, Infinity, '10', 10001, -10001]) {
      expect(sanitizeNavOverrides({ [KEY]: { order } })).toEqual({});
    }
  });

  it('keeps the map bounded', () => {
    const huge: Record<string, unknown> = {};
    for (let i = 0; i < NAV_OVERRIDES_MAX + 20; i++) {
      huge[`mod${i}:cashier-primary:/p${i}`] = { label: `n${i}` };
    }
    expect(Object.keys(sanitizeNavOverrides(huge))).toHaveLength(NAV_OVERRIDES_MAX);
  });
});
