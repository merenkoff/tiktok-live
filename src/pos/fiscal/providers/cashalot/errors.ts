// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/errors.ts
//
// Cashalot's errors → our error kinds. The names come from the ДПС list and
// Cashalot's own (`../../dps/errors.ts`, TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md
// §4.2 п. 11); only when the name says nothing does the HTTP status decide.
// The binding rule of the contract holds: `rejected` only when no document
// can exist, everything doubtful is `unknown`.

import { asFiscalError, FiscalError, type FiscalErrorKind } from '../../errors.js';
import { dpsErrorKind } from '../../dps/errors.js';
import { CashalotApiError } from './client.js';

const MAX_CODE = 64;

function kindByStatus(status: number): FiscalErrorKind {
  if (status === 401 || status === 403 || status === 404) return 'auth_rejected';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

export function classifyCashalotError(error: unknown): FiscalError {
  if (!(error instanceof CashalotApiError)) {
    return asFiscalError(error, 'Помилка ПРРО Cashalot');
  }
  const named = error.errorCode ? dpsErrorKind(error.errorCode) : 'unknown';
  const kind = named !== 'unknown' ? named : kindByStatus(error.httpStatus);
  return new FiscalError(error.errorMessage ?? error.message, kind, {
    providerCode: error.errorCode ? error.errorCode.slice(0, MAX_CODE) : undefined,
    httpStatus: error.httpStatus,
    raw: error.body,
  });
}

/** Whether a Cashalot error carries this name — for the answers a method reads by command. */
export function isCashalotError(error: unknown, name: string): error is CashalotApiError {
  return error instanceof CashalotApiError && error.errorCode === name;
}
