// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/checkoutError.ts
//
// Turns a failed `POST /sales/complete` into one of the outcomes the till has
// to render differently. Pure — no React, no axios instance — so the whole
// matrix is testable without a DOM.
//
// The distinction that matters is not "did it fail" but **what happened to the
// customer's money and goods**:
//   * 503 — nothing was written at all; ringing again is free.
//   * 502 + voided — the sale was cancelled; ring it again.
//   * 502 + kept — the customer paid and left with the goods, but the receipt
//     is not registered. This is NOT a failure screen.
//
// Today's code reads only `response.data.error`, which for these bodies is the
// machine code, so a cashier is shown the literal word `fiscal_unavailable`.
// The Ukrainian text is in `.message`.

import axios from 'axios';
import { OfflineFiscalError, FiscalSaleUnknownError } from '../offline/errors';

export type CheckoutFailure =
  /** Pre-flight refused: no sale row, no receipt number burned, no stock moved. */
  | { kind: 'fiscal_unavailable'; message: string; supportCode: string | null }
  /** The sale was created and then voided. Ring it again — a fresh uuid is minted. */
  | { kind: 'fiscal_failed_voided'; saleId: number; message: string; supportCode: string | null }
  /** The sale stands, un-fiscalised. The customer has paid and gone. */
  | { kind: 'fiscal_failed_kept'; saleId: number; message: string; supportCode: string | null }
  /** A replayed client_uuid whose sale was voided — that receipt is a corpse. */
  | { kind: 'sale_voided_replay'; saleId: number | null; message: string }
  /** A fiscalising store with no connection: the sale was refused outright. */
  | { kind: 'offline_blocked'; message: string }
  /** No response. The sale may or may not exist; probing is idempotent. */
  | { kind: 'unknown_state'; clientUuid: string; message: string }
  /** Anything else — stock, validation, a plain server error. */
  | { kind: 'rejected'; message: string };

interface FiscalFailBody {
  error?: string;
  code?: string;
  message?: string;
  support_code?: string;
  sale_id?: number;
  sale_voided?: boolean;
  sale_kept?: boolean;
}

const GENERIC = 'Не вдалося завершити продаж';

function bodyOf(error: unknown): FiscalFailBody | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data;
  // A proxy or gateway can answer 502 with an HTML page rather than JSON.
  return data && typeof data === 'object' ? (data as FiscalFailBody) : undefined;
}

export function classifyCheckoutError(error: unknown): CheckoutFailure {
  if (error instanceof OfflineFiscalError) {
    return { kind: 'offline_blocked', message: error.message };
  }
  if (error instanceof FiscalSaleUnknownError) {
    return { kind: 'unknown_state', clientUuid: error.clientUuid, message: error.message };
  }

  if (!axios.isAxiosError(error) || !error.response) {
    return { kind: 'rejected', message: error instanceof Error ? error.message : GENERIC };
  }

  const status = error.response.status;
  const body = bodyOf(error);
  const message = body?.message || body?.error || GENERIC;
  const supportCode = body?.support_code ?? null;

  if (status === 503 && body?.error === 'fiscal_unavailable') {
    return { kind: 'fiscal_unavailable', message, supportCode };
  }

  if (status === 409 && body?.error === 'sale_voided_not_fiscalised') {
    return {
      kind: 'sale_voided_replay',
      saleId: body.sale_id ?? null,
      message: message || 'Цей чек скасовано — почніть новий',
    };
  }

  if (status === 502 && body?.error === 'fiscal_failed') {
    // Branch on `sale_voided`, never on `sale_kept`: one server branch omits
    // `sale_kept` entirely, and reading it would silently drop that case into
    // the wrong outcome — the one that tells the cashier to ring it again for a
    // sale that already happened.
    const voided = body.sale_voided === true;
    const saleId = body.sale_id ?? 0;
    return voided
      ? { kind: 'fiscal_failed_voided', saleId, message, supportCode }
      : { kind: 'fiscal_failed_kept', saleId, message, supportCode };
  }

  return { kind: 'rejected', message };
}

/** Does this outcome mean the cart should be kept so the cashier can retry? */
export function keepsCart(failure: CheckoutFailure): boolean {
  return failure.kind !== 'fiscal_failed_kept';
}

/**
 * Should the payment modal stay open?
 *
 * Only where retrying the exact same action is both safe and the obvious next
 * step. `CheckoutModal` is an opaque full-screen overlay, so anything rendered
 * behind it is invisible — closing it for an error the cashier must read is how
 * the message gets lost.
 */
export function keepsModalOpen(failure: CheckoutFailure): boolean {
  return (
    failure.kind === 'fiscal_unavailable' ||
    failure.kind === 'offline_blocked' ||
    failure.kind === 'unknown_state'
  );
}
