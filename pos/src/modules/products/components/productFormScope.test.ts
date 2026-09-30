// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { productFormScope } from './productFormScope';

describe('productFormScope', () => {
  it('asks a boutique about neither composites nor a dish\'s words', () => {
    expect(productFormScope({ productKinds: ['simple'], dishFacts: false })).toEqual({
      canComposite: false,
      askDishFacts: false,
    });
  });

  it('asks a florist about composites, not about allergens', () => {
    expect(productFormScope({ productKinds: ['simple', 'composite'], dishFacts: false })).toEqual({
      canComposite: true,
      askDishFacts: false,
    });
  });

  it('asks a café about both', () => {
    expect(productFormScope({ productKinds: ['simple', 'composite'], dishFacts: true })).toEqual({
      canComposite: true,
      askDishFacts: true,
    });
  });

  it('shows everything when the vertical does not say — an auth cached before the fields existed', () => {
    expect(productFormScope({})).toEqual({ canComposite: true, askDishFacts: true });
  });

  it('treats an empty list of kinds as «no composite», not as «unknown»', () => {
    expect(productFormScope({ productKinds: [] }).canComposite).toBe(false);
  });
});
