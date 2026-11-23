// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the till's home screen shows out of a `home` answer (migration 112).

import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../test/utils';
import { countCards, pickTillHome } from './tillHome';

const row = (variant_id: number, product_id: number, over = {}) => makeCatalogItem({ variant_id, product_id, ...over });

describe('pickTillHome', () => {
  it('prefers the ticked cards, in the order they came', () => {
    const picked = pickTillHome([
      row(1, 1, { popular_rank: 1 }),
      row(2, 2, { till_home: true }),
      row(3, 3, { till_home: true }),
    ]);
    expect(picked?.kind).toBe('marked');
    expect(picked?.items.map((r) => r.variant_id)).toEqual([2, 3]);
  });

  it('ranks the sellers, a card keeping its variants in order', () => {
    const picked = pickTillHome([
      row(1, 1, { popular_rank: 2 }),
      row(2, 2, { popular_rank: 1 }),
      row(3, 1, { popular_rank: 2 }),
    ]);
    expect(picked?.kind).toBe('popular');
    expect(picked?.items.map((r) => r.variant_id)).toEqual([2, 1, 3]);
  });

  it('is null when nothing is ticked and nothing sold', () => {
    expect(pickTillHome([row(1, 1), row(2, 2, { popular_rank: null })])).toBeNull();
    expect(pickTillHome([])).toBeNull();
  });
});

describe('countCards', () => {
  it('counts products, not variants', () => {
    expect(countCards([row(1, 1), row(2, 1), row(3, 2)])).toBe(2);
  });
});
