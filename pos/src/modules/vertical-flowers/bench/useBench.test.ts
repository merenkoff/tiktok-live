// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeCatalogItem } from '../../../test/utils';
import { budgetRead, useBench } from './useBench';

const rose = (over: Partial<Parameters<typeof makeCatalogItem>[0]> = {}) =>
  makeCatalogItem({ variant_id: 1, product_name: 'Троянда', price_cents: 9000, quantity: 25, ...over });
const eucalyptus = () =>
  makeCatalogItem({ variant_id: 2, product_name: 'Евкаліпт', price_cents: 5500, quantity: 10 });

describe('useBench', () => {
  it('adds a stem and prices it with the shop’s assembly charge', () => {
    const { result } = renderHook(() => useBench(2500));
    act(() => result.current.add(rose(), 9));

    expect(result.current.totals.partsCents).toBe(81000);
    expect(result.current.totals.labourCents).toBe(20250);
    expect(result.current.totals.totalCents).toBe(101250);
    expect(result.current.totals.stemCount).toBe(9);
  });

  it('charges nothing for labour when the owner left it at zero', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose(), 3));

    expect(result.current.totals.labourCents).toBe(0);
    expect(result.current.totals.totalCents).toBe(27000);
  });

  it('never puts in more stems than the shelf holds', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose({ quantity: 4 }), 9));

    expect(result.current.stems[0].quantity).toBe(4);
  });

  it('keeps a stem in the row it was added to when its count changes', () => {
    // A stem that jumped to the bottom every time it was touched would undo
    // the whole point of a fixed layout — the panel reads as "what I did".
    const { result } = renderHook(() => useBench(0));
    act(() => {
      result.current.add(rose(), 3);
      result.current.add(eucalyptus(), 2);
    });
    act(() => result.current.add(rose(), 1));

    expect(result.current.stems.map((s) => s.item.variant_id)).toEqual([1, 2]);
    expect(result.current.countOf(1)).toBe(4);
  });

  it('drops a stem taken back to zero, with no confirm', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose(), 2));
    act(() => result.current.add(rose(), -2));

    expect(result.current.stems).toEqual([]);
    expect(result.current.countOf(1)).toBe(0);
  });

  it('setQuantity replaces a count outright, capped at the shelf', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose({ quantity: 12 }), 3));

    act(() => result.current.setQuantity(1, 7));
    expect(result.current.countOf(1)).toBe(7);

    act(() => result.current.setQuantity(1, 99));
    expect(result.current.countOf(1)).toBe(12);
  });

  it('setQuantity to zero is how the bin button takes a stem back out', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => {
      result.current.add(rose(), 3);
      result.current.add(eucalyptus(), 2);
    });
    act(() => result.current.setQuantity(1, 0));

    expect(result.current.stems.map((s) => s.item.variant_id)).toEqual([2]);
  });

  it('setQuantity ignores a stem that is not in the bouquet', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose(), 3));
    act(() => result.current.setQuantity(999, 5));

    expect(result.current.stems).toHaveLength(1);
  });

  it('a negative first tap puts nothing in', () => {
    const { result } = renderHook(() => useBench(0));
    act(() => result.current.add(rose(), -1));

    expect(result.current.stems).toEqual([]);
  });

  it('hands the cart the components, priced per one bouquet', () => {
    const { result } = renderHook(() => useBench(2500));
    act(() => {
      result.current.add(rose(), 9);
      result.current.add(eucalyptus(), 3);
    });

    expect(result.current.components).toEqual([
      expect.objectContaining({ component_variant_id: 1, quantity: 9, unit_price_cents: 9000 }),
      expect.objectContaining({ component_variant_id: 2, quantity: 3, unit_price_cents: 5500 }),
    ]);
  });

  describe('the number pad', () => {
    it('types into the stem last touched, first digit replacing the count', () => {
      // The whole point of the pad: «9 троянд» is two taps, not nine.
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose(), 1));
      act(() => result.current.typeDigit(9));

      expect(result.current.countOf(1)).toBe(9);
      expect(result.current.selectedId).toBe(1);
    });

    it('builds a number from the digits after the first', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose(), 1));
      act(() => result.current.typeDigit(1));
      act(() => result.current.typeDigit(2));

      expect(result.current.countOf(1)).toBe(12);
    });

    it('never types past what the shelf holds', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose({ quantity: 25 }), 1));
      act(() => result.current.typeDigit(9));
      act(() => result.current.typeDigit(9));

      expect(result.current.countOf(1)).toBe(25);
    });

    it('re-aims at a stem added earlier, and starts a fresh number there', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => {
        result.current.add(rose(), 1);
        result.current.add(eucalyptus(), 1);
      });
      act(() => result.current.typeDigit(3));
      expect(result.current.countOf(2)).toBe(3);

      act(() => result.current.select(1));
      act(() => result.current.typeDigit(5));

      expect(result.current.countOf(1)).toBe(5);
      expect(result.current.countOf(2)).toBe(3);
    });

    it('backspace rubs out the last digit', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose(), 1));
      act(() => result.current.typeDigit(1));
      act(() => result.current.typeDigit(2));
      act(() => result.current.backspace());

      expect(result.current.countOf(1)).toBe(1);
    });

    it('backspace on a single digit takes the stem out', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose(), 3));
      act(() => result.current.backspace());

      expect(result.current.stems).toEqual([]);
    });

    it('does nothing with an empty bouquet', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => {
        result.current.typeDigit(5);
        result.current.backspace();
      });

      expect(result.current.stems).toEqual([]);
      expect(result.current.selectedId).toBeNull();
    });
  });

  describe('loading a recipe', () => {
    it('puts the whole composition on the bench at once', () => {
      const { result } = renderHook(() => useBench(2500));
      act(() =>
        result.current.loadComposition([
          { item: rose(), quantity: 9 },
          { item: eucalyptus(), quantity: 3 },
        ])
      );

      expect(result.current.countOf(1)).toBe(9);
      expect(result.current.countOf(2)).toBe(3);
      expect(result.current.totals.totalCents).toBe(121875);
    });

    it('caps at the shelf — a recipe must not promise flowers that are gone', () => {
      // Written when the fridge was full, loaded when it is not. Nine roses out
      // of four is a bouquet the customer never gets.
      const { result } = renderHook(() => useBench(0));
      act(() =>
        result.current.loadComposition([{ item: rose({ quantity: 4 }), quantity: 9 }])
      );

      expect(result.current.countOf(1)).toBe(4);
    });

    it('drops a stem the shop has none of rather than showing a zero row', () => {
      const { result } = renderHook(() => useBench(0));
      act(() =>
        result.current.loadComposition([
          { item: rose({ quantity: 0 }), quantity: 9 },
          { item: eucalyptus(), quantity: 3 },
        ])
      );

      expect(result.current.stems.map((s) => s.item.variant_id)).toEqual([2]);
    });

    it('replaces what was there — it is a start, not an addition', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.add(rose(), 5));
      act(() => result.current.loadComposition([{ item: eucalyptus(), quantity: 2 }]));

      expect(result.current.stems.map((s) => s.item.variant_id)).toEqual([2]);
      expect(result.current.countOf(1)).toBe(0);
    });

    it('aims the pad at the last stem loaded, so a count can be typed straight away', () => {
      const { result } = renderHook(() => useBench(0));
      act(() =>
        result.current.loadComposition([
          { item: rose(), quantity: 9 },
          { item: eucalyptus(), quantity: 3 },
        ])
      );
      act(() => result.current.typeDigit(5));

      expect(result.current.countOf(2)).toBe(5);
      expect(result.current.countOf(1)).toBe(9);
    });

    it('an empty recipe leaves an empty bench with nothing selected', () => {
      const { result } = renderHook(() => useBench(0));
      act(() => result.current.loadComposition([]));

      expect(result.current.stems).toEqual([]);
      expect(result.current.selectedId).toBeNull();
    });
  });

  it('clear() empties the bouquet and forgets the budget', () => {
    const { result } = renderHook(() => useBench(2500));
    act(() => {
      result.current.add(rose(), 5);
      result.current.setBudgetCents(150000);
    });
    act(() => result.current.clear());

    expect(result.current.stems).toEqual([]);
    expect(result.current.budgetCents).toBeNull();
    expect(result.current.totals.totalCents).toBe(0);
  });
});

describe('budgetRead', () => {
  it('reads as nothing until a budget is named', () => {
    expect(budgetRead(50000, null, 9000, 2500)).toMatchObject({ ratio: 0, nextStems: null });
  });

  it('says how many more stems fit, grossed up by the labour charge', () => {
    // 1500 budget, 1012.50 spent, 487.50 left. A 90 rose costs 112.50 once
    // labour rides on it, so four fit — not five, which the shelf price alone
    // would have promised.
    const read = budgetRead(101250, 150000, 9000, 2500);

    expect(read.over).toBe(false);
    expect(read.remainingCents).toBe(48750);
    expect(read.nextStems).toBe(4);
  });

  it('warns the moment the bouquet goes over, with the amount', () => {
    const read = budgetRead(160000, 150000, 9000, 2500);

    expect(read.over).toBe(true);
    expect(read.remainingCents).toBe(-10000);
    expect(read.ratio).toBe(1);
    expect(read.nextStems).toBeNull();
  });
});
