// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.cashalot.errors.test.ts
//
// Cashalot's errors → our kinds (TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md
// §4.2 п. 11). The name decides; the HTTP status only when the name says
// nothing; and nothing doubtful ever becomes `rejected`, which would void a
// sale whose receipt may exist.

import { describe, expect, it } from 'vitest';
import { CashalotApiError } from '../pos/fiscal/providers/cashalot/client.js';
import { classifyCashalotError } from '../pos/fiscal/providers/cashalot/errors.js';
import { normalizeCashalotConfig, readConfig } from '../pos/fiscal/providers/cashalot/config.js';
import { parseCashalotDate, parseDpsDateTime } from '../pos/fiscal/providers/cashalot/dates.js';
import { controlNumberOf } from '../pos/fiscal/providers/cashalot/payload.js';

const api = (status: number, code: string | null, message: string | null = null) =>
  new CashalotApiError(status, code, message, { ErrorCode: code, ErrorMessage: message });

describe('classifyCashalotError', () => {
  it.each([
    ['DuplicatedRequestUid', 400, 'duplicate'],
    ['ShiftNotOpened', 200, 'shift_closed'],
    ['DocumentValidationError', 200, 'rejected'],
    ['InvalidTin', 200, 'rejected'],
    ['UndefinedRegistrarState', 200, 'auth_expired'],
    ['OperatorAccessToTransactionsRegistrarNotGranted', 200, 'auth_rejected'],
    ['TransactionsRegistrarAbsent', 200, 'auth_rejected'],
    ['CryptographyError', 200, 'auth_rejected'],
    ['LicenseViolation', 200, 'auth_rejected'],
    ['InconsistentRegistrarState', 200, 'unknown'],
    ['ShiftAlreadyOpened', 200, 'unknown'],
  ])('%s → %s', (code, status, kind) => {
    expect(classifyCashalotError(api(status, code)).kind).toBe(kind);
  });

  it('falls back to the HTTP status only when the name says nothing', () => {
    expect(classifyCashalotError(api(401, null)).kind).toBe('auth_rejected');
    expect(classifyCashalotError(api(404, 'SomethingNew')).kind).toBe('auth_rejected');
    expect(classifyCashalotError(api(429, null)).kind).toBe('rate_limited');
    expect(classifyCashalotError(api(503, null)).kind).toBe('unavailable');
    expect(classifyCashalotError(api(400, null)).kind).toBe('unknown');
  });

  it('reads a network failure or a timeout as unavailable', () => {
    expect(classifyCashalotError(new TypeError('fetch failed')).kind).toBe('unavailable');
    expect(classifyCashalotError(Object.assign(new Error('t'), { name: 'TimeoutError' })).kind).toBe('unavailable');
  });

  it('keeps Cashalot’s own words and the name for support', () => {
    const error = classifyCashalotError(api(200, 'DocumentValidationError', 'Сума не сходиться'));
    expect(error.message).toBe('Сума не сходиться');
    expect(error.providerCode).toBe('DocumentValidationError');
    expect(error.httpStatus).toBe(200);
  });
});

describe('Cashalot config', () => {
  const VAT = [{ letter: 'А', name: 'ПДВ', rate: 20 }];

  it('stores the tax table and the test mode in canonical form, nothing else', () => {
    expect(normalizeCashalotConfig({ taxes: [{ letter: ' а ', name: 'ПДВ', rate: 20 }], testing: true, junk: 1 }, { previous: null, shiftOpen: false })).toEqual({
      taxes: [{ letter: 'А', name: 'ПДВ', type: 0, rate: 20 }],
      testing: true,
    });
    expect(readConfig({})).toEqual({ taxes: [], testing: false });
  });

  it('refuses to change the table or the mode inside an open shift, but saves the same again', () => {
    const previous = normalizeCashalotConfig({ taxes: VAT, testing: false }, { previous: null, shiftOpen: false });
    expect(() => normalizeCashalotConfig({ taxes: [{ letter: 'Б', name: 'ПДВ', rate: 7 }] }, { previous, shiftOpen: true })).toThrow(/лише при закритій зміні/);
    expect(() => normalizeCashalotConfig({ taxes: VAT, testing: true }, { previous, shiftOpen: true })).toThrow(/лише при закритій зміні/);
    expect(normalizeCashalotConfig({ taxes: VAT, testing: false }, { previous, shiftOpen: true })).toEqual(previous);
  });

  it('refuses a test mode that is not a yes or no', () => {
    expect(() => normalizeCashalotConfig({ testing: 'yes' }, { previous: null, shiftOpen: false })).toThrow(/так або ні/);
  });
});

describe('Cashalot dates and numbers', () => {
  it('takes ISO with an offset as is and reads offset-less time as Kyiv', () => {
    expect(parseCashalotDate('2026-10-24T12:05:00+03:00')).toBe('2026-10-24T09:05:00.000Z');
    // October 24 is still summer time in Kyiv (UTC+3), January is UTC+2.
    expect(parseCashalotDate('2026-10-24T12:05:00')).toBe('2026-10-24T09:05:00.000Z');
    expect(parseCashalotDate('24.01.2026 12:05:00')).toBe('2026-01-24T10:05:00.000Z');
    expect(parseCashalotDate('yesterday')).toBeNull();
    expect(parseCashalotDate(null)).toBeNull();
    expect(parseDpsDateTime('24102026', '120500')).toBe('2026-10-24T09:05:00.000Z');
    expect(parseDpsDateTime('31022026', '120500')).toBeNull();
  });

  it('takes the control number from an offline number only', () => {
    expect(controlNumberOf('82563.25.6127')).toBe('6127');
    expect(controlNumberOf('100042')).toBeNull();
  });
});
