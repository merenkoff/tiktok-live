// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashPin,
  isValidPin,
  normalizePin,
  verifyPassword,
  verifyPin,
} from '../pos/core/crypto.js';

describe('POS crypto / PIN', () => {
  it('validates PIN length', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12ab')).toBe(false);
  });

  it('normalizes PIN digits', () => {
    expect(normalizePin('12-34')).toBe('1234');
  });

  it('hashes and verifies password', async () => {
    const hash = await hashPassword('owner123');
    expect(await verifyPassword('owner123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('hashes and verifies PIN', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
    expect(await verifyPin('0000', hash)).toBe(false);
  });
});
