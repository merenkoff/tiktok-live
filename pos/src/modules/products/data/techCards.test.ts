// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { missingReason, sortTechCards } from './techCards';
import type { TechCardRow } from './techCardsApi';

function card(overrides: Partial<TechCardRow> = {}): TechCardRow {
  return {
    variant_id: 1,
    product_id: 1,
    product_name: 'Борщ',
    label: '',
    unit: 'шт',
    kind: 'composite',
    stock_mode: 'derived',
    price_cents: 20000,
    cost_cents: 6100,
    leaf_count: 2,
    has_unpriced_leaf: false,
    food_cost_bps: 3050,
    ...overrides,
  };
}

describe('missingReason — «—» has to say why', () => {
  it('is null when the percentage is honest', () => {
    expect(missingReason(card())).toBeNull();
  });

  // Named in the order the owner can act on them.
  it('names the empty recipe first', () => {
    expect(
      missingReason(card({ food_cost_bps: null, leaf_count: 0, price_cents: 0 }))
    ).toBe('немає рецепта');
  });

  it('names the missing price next', () => {
    expect(missingReason(card({ food_cost_bps: null, price_cents: 0 }))).toBe(
      'немає ціни продажу'
    );
  });

  it('names the unpriced ingredient last', () => {
    expect(
      missingReason(card({ food_cost_bps: null, has_unpriced_leaf: true }))
    ).toBe('не вистачає собівартості складника');
  });

  // A null with none of the three known causes should not happen — the server
  // decides them together — but the screen must still say something true
  // rather than a percentage it does not have.
  it('stays honest for a shape it does not recognise', () => {
    expect(missingReason(card({ food_cost_bps: null }))).toBe('немає даних');
  });
});

describe('sortTechCards — worst first, unknown last', () => {
  it('puts the dish eating the most of its price on top', () => {
    const rows = [
      card({ variant_id: 1, food_cost_bps: 2000 }),
      card({ variant_id: 2, food_cost_bps: 7000 }),
      card({ variant_id: 3, food_cost_bps: 4000 }),
    ];
    expect(sortTechCards(rows).map((r) => r.variant_id)).toEqual([2, 3, 1]);
  });

  // «Невідомо» is not a place on a list of the worst offenders: putting the
  // unknowns first would bury the real ones under them.
  it('sends the rows with no percentage to the end', () => {
    const rows = [
      card({ variant_id: 1, food_cost_bps: null }),
      card({ variant_id: 2, food_cost_bps: 9000 }),
      card({ variant_id: 3, food_cost_bps: null }),
      card({ variant_id: 4, food_cost_bps: 1000 }),
    ];
    expect(sortTechCards(rows).map((r) => r.variant_id)).toEqual([2, 4, 1, 3]);
  });

  it('does not mutate what it was given', () => {
    const rows = [card({ variant_id: 1, food_cost_bps: 100 }), card({ variant_id: 2, food_cost_bps: 900 })];
    sortTechCards(rows);
    expect(rows.map((r) => r.variant_id)).toEqual([1, 2]);
  });
});
