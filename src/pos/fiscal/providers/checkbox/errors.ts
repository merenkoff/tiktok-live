// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/errors.ts
//
// Checkbox HTTP response -> FiscalErrorKind. The mapping is drawn from
// real sandbox responses (src/__tests__/fixtures/checkbox/*.json), not the
// OpenAPI spec: the spec only documents `422 HTTPValidationError` with free
// text, but every other failure we actually provoked carries a structured
// `code` field. See that directory's README for the full findings.

import { asFiscalError, FiscalError } from '../../errors.js';
import { CheckboxApiError } from './client.js';

/**
 * `auth_expired`, not `auth_rejected`: `base.credentials` fires identically
 * for a garbage token and for a genuinely-stale one (the JWT itself carries
 * no `exp` claim — a Checkbox sandbox sign-in token decodes to
 * `{token_type, jti, sub, nbf, iat}`, nothing else). Classifying it as the
 * terminal `auth_rejected` would mean a session invalidated for an ordinary
 * reason never recovers on its own.
 */
const AUTH_EXPIRED_CODES = new Set(['base.credentials']);

const AUTH_REJECTED_CODES = new Set([
  'cashier.invalid_credentials', // wrong PIN
  'cash_register.invalid_license_key', // wrong X-License-Key
]);

/**
 * Two offline refusals come back with a human message and no structured code
 * (TechDocs/checkbox-api/{receipts-offline,cash-register}.md). Both mean the
 * document was NOT created, so `rejected` is exact; the synthetic provider
 * code is what the replay orchestrator branches on ("take the next code" vs
 * "go offline first").
 */
const OFFLINE_MESSAGE_CODES: ReadonlyArray<[RegExp, string]> = [
  [/manual offline mode/i, 'offline_not_manual'],
  [/was used before/i, 'offline_code_used'],
];

function bodyMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    return typeof m === 'string' ? m : null;
  }
  return null;
}

export function classifyCheckboxError(error: unknown): FiscalError {
  if (!(error instanceof CheckboxApiError)) {
    return asFiscalError(error, 'Помилка ПРРО Checkbox');
  }

  const { status, code, body } = error;
  const opts = { providerCode: code, httpStatus: status, raw: body };

  const message = bodyMessage(body);
  if (message && status < 500) {
    for (const [pattern, providerCode] of OFFLINE_MESSAGE_CODES) {
      if (pattern.test(message)) {
        return new FiscalError(message, 'rejected', { ...opts, providerCode });
      }
    }
  }

  if (code && AUTH_REJECTED_CODES.has(code)) {
    return new FiscalError(error.message, 'auth_rejected', opts);
  }
  if (code && AUTH_EXPIRED_CODES.has(code)) {
    return new FiscalError(error.message, 'auth_expired', opts);
  }
  if (code === 'receipt.already_exists') {
    return new FiscalError(error.message, 'duplicate', opts);
  }
  if (code === 'shift.not_opened') {
    return new FiscalError(error.message, 'shift_closed', opts);
  }
  if (code === 'validation.custom') {
    // The one code with no further structure at the top level — field-level
    // detail lives in `body.detail[].loc/.type`, kept in `raw` rather than
    // parsed into subtypes. Always means the payload we sent was rejected
    // before anything was created (confirmed: both an empty `goods` array and
    // a missing X-License-Key header answered 422 with this code).
    return new FiscalError(error.message, 'rejected', opts);
  }
  if (status === 429) {
    // Never reproduced in the sandbox (see fixtures README, finding #7) — six
    // rapid receipts all succeeded, so the shape of a real 429 body is
    // unconfirmed. `rate_limited` is the right kind either way; extracting
    // `retryAfterMs` from a `Retry-After` header is left for whenever a real
    // 429 is actually observed.
    return new FiscalError(error.message, 'rate_limited', opts);
  }
  if (status >= 500) {
    return new FiscalError(error.message, 'unavailable', opts);
  }
  return new FiscalError(error.message, 'unknown', opts);
}
