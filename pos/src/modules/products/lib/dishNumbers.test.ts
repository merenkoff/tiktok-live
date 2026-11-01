// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { countToInput, numberInputToWire, strengthInputToWire, tenthsToInput } from './dishNumbers';

describe('the facts line’s numbers on the card (F14)', () => {
  it('shows stored tenths as a percent with a comma, and a whole percent without one', () => {
    expect(tenthsToInput(45)).toBe('4,5');
    expect(tenthsToInput(400)).toBe('40');
    expect(tenthsToInput(0)).toBe('0');
    expect(tenthsToInput(null)).toBe('');
    expect(tenthsToInput(undefined)).toBe('');
  });

  it('shows a stored count as its digits and «not said» as empty', () => {
    expect(countToInput(420)).toBe('420');
    expect(countToInput(0)).toBe('0');
    expect(countToInput(null)).toBe('');
    expect(countToInput(undefined)).toBe('');
  });

  it('sends what was typed, trimmed, and null for an emptied box — the server parses it', () => {
    expect(numberInputToWire(' 420 ')).toBe('420');
    expect(numberInputToWire('')).toBeNull();
    expect(numberInputToWire('   ')).toBeNull();
    expect(numberInputToWire('abc')).toBe('abc');
    expect(strengthInputToWire('4,5')).toBe('4,5');
    expect(strengthInputToWire('')).toBeNull();
  });
});
