// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { batchText } from './recipeBatch';

describe('batchText — a batch in a kitchen’s words', () => {
  it('writes kilograms and litres from a thousand up, pieces as they are', () => {
    expect(batchText(1900, 'г')).toBe('1,9 кг');
    expect(batchText(5000, 'мл')).toBe('5 л');
    expect(batchText(1675, 'г')).toBe('1,675 кг');
    expect(batchText(905, 'г')).toBe('905 г');
    expect(batchText(40, 'шт')).toBe('40 шт');
  });
});
