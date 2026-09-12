// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/errors.ts
//
// One error class with a discriminated `kind`, because every caller branches on
// the same question: retry, recover-then-retry, give up, or celebrate.
//
// Adapters translate provider-specific failures into these kinds; nothing above
// the adapter layer ever inspects an HTTP status. See TechDocs/POS_FISCAL_PRRO.md §7.

/**
 * Why a fiscal call failed.
 *
 * Terminal:
 *   `not_configured` — setup is incomplete (no credentials, no tax code).
 *   `auth_rejected`  — the provider says these credentials are wrong.
 *   `rejected`       — the provider validated the document and refused it.
 *
 * **Contract on adapters, not an inference: `rejected` means NO DOCUMENT WAS
 * CREATED.** The orchestrator voids a committed sale only for failures that
 * cannot have left a document at the provider, and `rejected` is on that list
 * (`mayExistAtProvider` in `fiscal.service.ts`). An adapter that returns
 * `rejected` for an outcome the provider might actually have recorded will
 * cause fiscalised sales to be voided and re-rung — two fiscal receipts, tax
 * owed on both. When in doubt, return `unknown`.
 *
 * Recoverable — one repair, then exactly one more attempt:
 *   `auth_expired`   — re-sign-in.
 *   `shift_closed`   — open a shift.
 *   `shift_expired`  — close the stale shift and open a fresh one.
 *
 * Retryable — same call again, later:
 *   `rate_limited`   — honour `retryAfterMs`.
 *   `unavailable`    — network error or 5xx.
 *   `unknown`        — unclassified; retried, but counts toward abandonment.
 *
 * Ours, not the provider's — raised by the register-holder gate
 * (TechDocs/POS_FISCAL_OFFLINE.md §3а), never by an adapter:
 *   `register_held`  — another till owns this register; routes answer 409.
 *
 * Ours as well — the offline-session gates (POS_FISCAL_OFFLINE.md, план
 * фазы 2), all terminal for the request that hit them, none of them means a
 * document might exist at the provider:
 *   `replaying`               — the session is being sent; sell again in a minute.
 *   `offline_limit`           — the session is older than the 36h offline limit.
 *   `shift_deadline`          — the shift is about to hit its 24h limit.
 *   `offline_session_open`    — refunds/service receipts/shift close wait for the replay.
 *   `offline_codes_exhausted` — the pool has no free tax-office code left.
 *
 * Ours too, and terminal rather than "wait" — the till stamped a sale offline
 * with a code we cannot honour (фаза 3):
 *   `offline_code_invalid`    — not leased to this till, already spent, or burned.
 *
 * And the one that is not a failure at all:
 *   `duplicate`      — the provider already holds this `requestId`.
 */
export type FiscalErrorKind =
  | 'not_configured'
  | 'register_held'
  | 'replaying'
  | 'offline_limit'
  | 'shift_deadline'
  | 'offline_session_open'
  | 'offline_codes_exhausted'
  | 'offline_code_invalid'
  | 'auth_rejected'
  | 'rejected'
  | 'auth_expired'
  | 'shift_closed'
  | 'shift_expired'
  | 'rate_limited'
  | 'unavailable'
  | 'unknown'
  | 'duplicate';

export interface FiscalErrorOptions {
  /** The provider's own error code, kept for support and telemetry. */
  providerCode?: string | null;
  httpStatus?: number | null;
  /** For `rate_limited`: how long the provider asked us to wait. */
  retryAfterMs?: number | null;
  /**
   * For `duplicate`: the provider's id for the document it already made, when
   * it tells us. Absent means the orchestrator has to search by `requestId`.
   */
  existingProviderDocId?: string | null;
  raw?: unknown;
  cause?: unknown;
}

export class FiscalError extends Error {
  readonly kind: FiscalErrorKind;
  readonly providerCode: string | null;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;
  readonly existingProviderDocId: string | null;
  readonly raw: unknown;
  /** Own property, not `Error.cause`: the project compiles against ES2020. */
  readonly cause: unknown;

  constructor(message: string, kind: FiscalErrorKind, opts: FiscalErrorOptions = {}) {
    super(message);
    this.name = 'FiscalError';
    this.cause = opts.cause;
    this.kind = kind;
    this.providerCode = opts.providerCode ?? null;
    this.httpStatus = opts.httpStatus ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.existingProviderDocId = opts.existingProviderDocId ?? null;
    this.raw = opts.raw;
  }
}

export function isFiscalError(error: unknown): error is FiscalError {
  return error instanceof FiscalError;
}

/**
 * `duplicate` is the correctness keystone of the whole feature.
 *
 * Providers accept a client-supplied document id; a second POST with the same
 * id conflicts. Without treating that conflict as success, a network timeout
 * that struck *after* the provider committed the receipt would make us send it
 * again — two fiscal receipts in the tax record for one sale, and tax owed on
 * both. So this is not an error path, it is the recovery path.
 */
export function isDuplicate(kind: FiscalErrorKind): boolean {
  return kind === 'duplicate';
}

/** Same call again later, unchanged. */
export function isRetryable(kind: FiscalErrorKind): boolean {
  return kind === 'rate_limited' || kind === 'unavailable' || kind === 'unknown';
}

/** Fixable in-flight: repair once, then retry once. Never loop. */
export function isRecoverable(kind: FiscalErrorKind): boolean {
  return kind === 'auth_expired' || kind === 'shift_closed' || kind === 'shift_expired';
}

/** Retrying cannot help. Needs the owner, or a different document. */
export function isTerminal(kind: FiscalErrorKind): boolean {
  return (
    kind === 'not_configured' ||
    kind === 'auth_rejected' ||
    kind === 'rejected' ||
    kind === 'register_held' ||
    kind === 'offline_code_invalid' ||
    isOfflineGate(kind)
  );
}

/** Raised by our offline-session gates before any provider call — the request is refused, nothing was sent. */
export function isOfflineGate(kind: FiscalErrorKind): boolean {
  return (
    kind === 'replaying' ||
    kind === 'offline_limit' ||
    kind === 'shift_deadline' ||
    kind === 'offline_session_open' ||
    kind === 'offline_codes_exhausted'
  );
}

/**
 * Cashier-facing Ukrainian text.
 *
 * Deliberately says what to DO, not what broke: the person reading it is
 * standing in front of a customer. The support code carries the detail.
 */
const CASHIER_MESSAGES: Record<FiscalErrorKind, string> = {
  not_configured: 'ПРРО не налаштовано — зверніться до власника магазину',
  register_held: 'Касу ПРРО зайнято іншим пристроєм — запросіть передачу',
  replaying: 'ПРРО надсилає офлайн-чеки — спробуйте за хвилину',
  offline_limit: 'Офлайн ПРРО триває понад 36 годин — потрібен звʼязок із ПРРО',
  shift_deadline: 'Зміна ПРРО добігає доби — закрийте зміну та відкрийте нову',
  offline_session_open: 'Офлайн-чеки ПРРО ще не надіслано — повторіть після синхронізації',
  offline_codes_exhausted: 'Закінчились офлайн-коди ПРРО — потрібен звʼязок із ПРРО',
  offline_code_invalid: 'Цей офлайн-чек не можна прийняти — код ПРРО недійсний для цієї каси',
  auth_rejected: 'ПРРО відхилило дані доступу — зверніться до власника магазину',
  rejected: 'ПРРО відхилило чек — перевірте товари та ціни',
  auth_expired: 'Сесія ПРРО завершилась — спробуйте ще раз',
  shift_closed: 'Зміну ПРРО закрито — відкрийте зміну',
  shift_expired: 'Зміна ПРРО триває понад добу — закрийте та відкрийте нову',
  rate_limited: 'ПРРО не встигає обробити чеки — спробуйте ще раз',
  unavailable: 'Немає звʼязку з ПРРО — спробуйте ще раз',
  unknown: 'Помилка ПРРО — спробуйте ще раз',
  duplicate: 'Чек уже зареєстровано в ПРРО',
};

export function cashierMessage(kind: FiscalErrorKind): string {
  return CASHIER_MESSAGES[kind];
}

/**
 * A short code for the support line, e.g. `FS-UNAVAILABLE-503`.
 *
 * Mirrors the `TL-…` codes the tiktok-live module produces: something the
 * cashier can read down the phone that identifies the cause exactly.
 */
export function supportCode(error: unknown): string {
  if (!isFiscalError(error)) return 'FS-INTERNAL';
  const parts = ['FS', error.kind.toUpperCase().replace(/_/g, '-')];
  if (error.httpStatus) parts.push(String(error.httpStatus));
  else if (error.providerCode) parts.push(error.providerCode.toUpperCase().slice(0, 16));
  return parts.join('-');
}

/**
 * Wrap a thrown non-`FiscalError` — a `fetch` rejection, an abort, a parse
 * failure — as the closest kind, so adapter code can stay linear.
 */
export function asFiscalError(error: unknown, fallbackMessage: string): FiscalError {
  if (isFiscalError(error)) return error;
  if (error instanceof Error) {
    // AbortSignal.timeout() rejects with a TimeoutError DOMException; a real
    // network failure rejects with a TypeError. Both mean "try again later".
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return new FiscalError('Час очікування ПРРО вичерпано', 'unavailable', { cause: error });
    }
    if (error.name === 'TypeError') {
      return new FiscalError(fallbackMessage, 'unavailable', { cause: error });
    }
  }
  return new FiscalError(fallbackMessage, 'unknown', { cause: error });
}
