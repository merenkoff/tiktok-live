// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { adultOnlyLines, ageRestricted, needsAgeCheck } from './ageCheck';

const coffee = {
  modifier_groups: [
    {
      id: 1,
      name: 'Додати',
      min_select: 0,
      max_select: 1,
      modifiers: [
        { id: 11, name: 'коньяк', price_delta_cents: 6000, is_default: false, component_variant_id: 5, component_quantity: 20, age_restricted: true },
        { id: 12, name: 'цукор', price_delta_cents: 0, is_default: false, component_variant_id: null, component_quantity: null },
      ],
    },
  ],
};

describe('age check', () => {
  it('marks a card sold to adults, and a coffee only with the cognac chosen', () => {
    expect(ageRestricted({ age_restricted: true }, [])).toBe(true);
    expect(ageRestricted(coffee, [])).toBe(false);
    expect(ageRestricted(coffee, [12])).toBe(false);
    expect(ageRestricted(coffee, [11])).toBe(true);
  });

  it('asks only where the store asks, the receipt holds such goods and nobody answered yet', () => {
    const lines = [{ age_restricted: true }, {}];
    expect(adultOnlyLines(lines)).toHaveLength(1);
    expect(needsAgeCheck(lines, true, false)).toBe(true);
    expect(needsAgeCheck(lines, true, true)).toBe(false);
    expect(needsAgeCheck(lines, false, false)).toBe(false);
    expect(needsAgeCheck(lines, undefined, false)).toBe(false);
    expect(needsAgeCheck([{}], true, false)).toBe(false);
  });
});
