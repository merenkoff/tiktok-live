// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Every row of this table is drawn from a real sandbox response, not a
// guess — see src/__tests__/fixtures/checkbox/README.md for the captures.

import { describe, expect, it } from 'vitest';
import { CheckboxApiError } from '../pos/fiscal/providers/checkbox/client.js';
import { classifyCheckboxError } from '../pos/fiscal/providers/checkbox/errors.js';

function apiError(status: number, code: string | null, body: unknown = {}) {
  return new CheckboxApiError(status, code, body);
}

describe('classifyCheckboxError', () => {
  it('maps an invalid PIN to auth_rejected', () => {
    const err = classifyCheckboxError(
      apiError(403, 'cashier.invalid_credentials', { message: 'Невірний пінкод' })
    );
    expect(err.kind).toBe('auth_rejected');
    expect(err.httpStatus).toBe(403);
    expect(err.providerCode).toBe('cashier.invalid_credentials');
  });

  it('maps an invalid license key to auth_rejected', () => {
    const err = classifyCheckboxError(apiError(401, 'cash_register.invalid_license_key'));
    expect(err.kind).toBe('auth_rejected');
  });

  it('maps a bad/expired bearer token to auth_expired, not auth_rejected', () => {
    // base.credentials fires identically for garbage and genuinely-stale
    // tokens (the JWT has no exp claim) — auth_expired is recoverable
    // (one re-sign-in), auth_rejected is terminal. Getting this backwards
    // means a session invalidated for an ordinary reason never recovers.
    const err = classifyCheckboxError(apiError(401, 'base.credentials'));
    expect(err.kind).toBe('auth_expired');
  });

  it('maps a duplicate receipt id to duplicate', () => {
    const err = classifyCheckboxError(apiError(400, 'receipt.already_exists'));
    expect(err.kind).toBe('duplicate');
  });

  it('maps a sale attempt without an open shift to shift_closed', () => {
    const err = classifyCheckboxError(apiError(400, 'shift.not_opened'));
    expect(err.kind).toBe('shift_closed');
  });

  it('maps a validation error to rejected — the payload was refused before anything was created', () => {
    const err = classifyCheckboxError(
      apiError(422, 'validation.custom', {
        detail: [{ loc: ['body', 'goods'], type: 'value_error.list.min_items' }],
      })
    );
    expect(err.kind).toBe('rejected');
    expect(err.raw).toMatchObject({ detail: expect.any(Array) });
  });

  it('maps a 429 to rate_limited even though it was never reproduced live', () => {
    const err = classifyCheckboxError(apiError(429, null));
    expect(err.kind).toBe('rate_limited');
  });

  it('maps any 5xx to unavailable', () => {
    expect(classifyCheckboxError(apiError(500, null)).kind).toBe('unavailable');
    expect(classifyCheckboxError(apiError(503, 'some.unknown.code')).kind).toBe('unavailable');
  });

  it('maps an unrecognised code/status to unknown, never guessing', () => {
    expect(classifyCheckboxError(apiError(400, 'something.new')).kind).toBe('unknown');
    expect(classifyCheckboxError(apiError(404, null)).kind).toBe('unknown');
  });

  it('delegates a non-CheckboxApiError (network failure, abort) to asFiscalError', () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(classifyCheckboxError(timeout).kind).toBe('unavailable');

    expect(classifyCheckboxError(new TypeError('fetch failed')).kind).toBe('unavailable');
  });

  it('carries the raw body through for support diagnosis', () => {
    const body = { code: 'shift.not_opened', message: 'Зміну не відкрито' };
    const err = classifyCheckboxError(apiError(400, 'shift.not_opened', body));
    expect(err.raw).toBe(body);
  });
});
