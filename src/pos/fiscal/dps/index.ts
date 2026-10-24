// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/index.ts
//
// The ДПС document model, shared by every adapter that speaks the tax
// office's own format — Cashalot's WEB API now, an own ПРРО later. Pure: no
// database, no network, no provider names.

export * from './types.js';
export { toAmount, toUah } from './money.js';
export { unitFields } from './units.js';
export { payForm, type DpsPayForm } from './payments.js';
export {
  computeCheckTax,
  DpsTaxTableError,
  includedTaxCents,
  letterCode,
  normalizeTaxTable,
  resolveLetter,
  type DpsTaxedLine,
} from './taxes.js';
export { buildRefundCheck, buildSaleCheck, buildServiceCheck, type DpsBuiltCheck } from './check.js';
export { dpsErrorKind, NO_CONTENT, SHIFT_ALREADY_OPENED, ZREP_ALREADY_REGISTERED } from './errors.js';
