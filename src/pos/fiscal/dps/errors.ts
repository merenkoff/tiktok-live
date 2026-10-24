// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/errors.ts
//
// Error NAMES of the ДПС fiscal server and of Cashalot → our error kinds
// (TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md §4.2 п. 11). Names, never the
// numbers: Cashalot's duplicate arrives as «13 DuplicatedRequestUid» while 13
// in the ДПС list is `NoContent`.
//
// Two names depend on the command and are left to the adapter:
// `ShiftAlreadyOpened` is a success for «open the shift», and
// `ZRepAlreadyRegistered` on closing means «read the shift again». `NoContent`
// on a read is «not found», not an error.

import type { FiscalErrorKind } from '../errors.js';

const KIND_BY_NAME: Readonly<Record<string, FiscalErrorKind>> = {
  // The provider already holds this request's UID: read the document, never re-send.
  DuplicatedRequestUid: 'duplicate',
  ShiftNotOpened: 'shift_closed',
  // Refused while validating: no document was created.
  DocumentValidationError: 'rejected',
  InvalidQueryParameter: 'rejected',
  InvalidTin: 'rejected',
  // «Отримайте стан ПРРО командою TransactionsRegistrarState» — the session
  // path: drop it, sign in again (which reads the state) and re-send once.
  UndefinedRegistrarState: 'auth_expired',
  TransactionsRegistrarAbsent: 'auth_rejected',
  OperatorAccessToTransactionsRegistrarNotGranted: 'auth_rejected',
  CryptographyError: 'auth_rejected',
  // The provider's view of the register drifted (needs `Cleanup` in its
  // cabinet); a document may or may not exist — when in doubt, `unknown`.
  InconsistentRegistrarState: 'unknown',
  CheckLocalNumberInvalid: 'unknown',
};

/** The kind for an error name; anything not listed is `unknown` — never `rejected` by default. */
export function dpsErrorKind(name: string | null | undefined): FiscalErrorKind {
  const key = name?.trim();
  return (key && KIND_BY_NAME[key]) || 'unknown';
}

/** Names the adapter interprets by command rather than by this table. */
export const SHIFT_ALREADY_OPENED = 'ShiftAlreadyOpened';
export const ZREP_ALREADY_REGISTERED = 'ZRepAlreadyRegistered';
export const NO_CONTENT = 'NoContent';
