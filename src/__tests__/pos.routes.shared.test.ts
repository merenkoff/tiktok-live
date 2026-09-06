// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.routes.shared.test.ts
//
// routes/_shared.ts — two one-liners that every POS handler routes its errors
// through. `isUniqueViolation` is what turns a Postgres 23505 into a 409
// instead of a 400, and `errorMessage` is the only thing standing between a
// thrown non-Error and an empty error body.

import { describe, expect, it } from 'vitest';
import { errorMessage, isUniqueViolation } from '../pos/routes/_shared.js';

describe('errorMessage', () => {
  it('unwraps an Error', () => {
    expect(errorMessage(new Error('Product not found'))).toBe('Product not found');
  });

  it('unwraps a subclass of Error', () => {
    class QrProviderError extends Error {}
    expect(errorMessage(new QrProviderError('qr_not_configured'))).toBe('qr_not_configured');
  });

  it.each([
    ['a string', 'plain string'],
    ['a boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { message: 'looks like an error' }],
  ])('falls back to "Unknown error" for %s', (_label, value) => {
    expect(errorMessage(value)).toBe('Unknown error');
  });
});

describe('isUniqueViolation', () => {
  it('recognises Postgres 23505', () => {
    expect(isUniqueViolation(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(
      true
    );
  });

  it('accepts a bare object carrying the code — pg errors are not always Error instances', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it.each([
    ['a foreign-key violation', { code: '23503' }],
    ['a check violation', { code: '23514' }],
    ['a numeric code', { code: 23505 }],
    ['an error with no code', new Error('boom')],
    ['null', null],
    ['a string', '23505'],
  ])('rejects %s', (_label, value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });
});
