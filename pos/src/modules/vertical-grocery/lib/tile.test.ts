// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { groceryTile } from './tile';

const piece = (price: number, quantity: number, compare?: number | null) => ({
  price_cents: price,
  compare_at_cents: compare ?? null,
  price_per: 1,
  unit: 'шт',
  quantity,
});

const weighed = (price: number, quantity: number, compare?: number | null, unit = 'г') => ({
  price_cents: price,
  compare_at_cents: compare ?? null,
  price_per: 1000,
  unit,
  quantity,
});

describe('groceryTile', () => {
  it('reads a packed card as any shop does: cheapest price, pieces on the shelf, greyed at none', () => {
    expect(groceryTile([piece(4690, 24), piece(4990, 18)])).toEqual({
      priceCents: 4690,
      compareAtCents: null,
      stock: 42,
      disabled: false,
    });
    expect(groceryTile([piece(4690, 0)])).toMatchObject({ stock: 0, disabled: true });
  });

  it('prices a weighed card per kilogram, counts no pieces and never greys it — the scale is the truth', () => {
    expect(groceryTile([weighed(18990, 0), weighed(21990, -150)])).toEqual({
      priceCents: 18990,
      priceUnit: 'кг',
      compareAtCents: null,
      disabled: false,
    });
  });

  it('says litres for a drink poured by the millilitre', () => {
    expect(groceryTile([weighed(3490, 50000, null, 'мл')])).toMatchObject({ priceCents: 3490, priceUnit: 'л' });
  });

  it('keeps a weighed markdown: the old price per kilogram beside the new one', () => {
    expect(groceryTile([weighed(18990, 5200, 22990)]).compareAtCents).toBe(22990);
  });

  it('shows an old price only when every variant at the price shown carries the same one', () => {
    expect(groceryTile([piece(4690, 5, 5290), piece(4690, 5, 5290), piece(4990, 5)]).compareAtCents).toBe(5290);
    // One of the cheapest is not marked down: an old price beside it would lie.
    expect(groceryTile([piece(4690, 5, 5290), piece(4690, 5)]).compareAtCents).toBeNull();
    // Only the dearer variant is marked down: it is not the price on the tile.
    expect(groceryTile([piece(4690, 5), piece(4990, 5, 5990)]).compareAtCents).toBeNull();
    // An «old» price that is not higher is no markdown at all.
    expect(groceryTile([piece(4690, 5, 4690)]).compareAtCents).toBeNull();
  });

  it('names no price on a card mixing weighed and packed goods, and never greys it', () => {
    // A cheese by the kilogram and the same cheese in a 200 g pack: the cheapest
    // of a price per kilogram and a price per pack means nothing.
    expect(groceryTile([weighed(18990, 0), piece(4990, 0)])).toEqual({ compareAtCents: null, disabled: false });
  });

  it('names no price when a kilogram and a litre share one card', () => {
    expect(groceryTile([weighed(18990, 1000), weighed(3490, 1000, null, 'мл')])).toEqual({
      compareAtCents: null,
      disabled: false,
    });
  });

  it('greys a card with nothing in it', () => {
    expect(groceryTile([])).toEqual({ compareAtCents: null, disabled: true });
  });
});
