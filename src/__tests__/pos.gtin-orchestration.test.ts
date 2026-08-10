import { describe, expect, it, vi, afterEach } from 'vitest';
import { mapOpenFactsResponse } from '../pos/gtin/open-facts.js';
import { sourceScore } from '../pos/gtin/types.js';

describe('gtin enrichment orchestration helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sourceScore respects GTIN_SOURCE_PRIORITY override for food-first', () => {
    vi.stubEnv(
      'GTIN_SOURCE_PRIORITY',
      'open_food_facts,open_products_facts,upc_dev,upcitemdb,open_beauty_facts,manual'
    );
    expect(sourceScore('open_food_facts')).toBeGreaterThan(sourceScore('open_products_facts'));
  });

  it('open facts miss and hit fixtures', () => {
    expect(mapOpenFactsResponse('food', { status: 0 }).found).toBe(false);
    expect(
      mapOpenFactsResponse('food', {
        status: 1,
        product: { product_name: 'Yogurt', brands: 'Danone' },
      }).found
    ).toBe(true);
  });
});
