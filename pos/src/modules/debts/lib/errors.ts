// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a refused debt write says, read off the server's answer.
//
// The server words every refusal for the cashier («Понад ліміт: борг … ліміт
// …», «Погашати можна лише від найстарішого товару»), so the screen prints
// `error` as it is and never «Request failed with status code 409».

import type { DebtCredit, DebtLine } from './types';

export interface DebtFailure {
  /** The sentence to show. */
  text: string;
  /** The server's machine word (`over_limit`, `stale_statement`, `unavailable`…), when it gave one. */
  code: string | null;
  /** The HTTP status; null when nothing came back at all. */
  status: number | null;
  /**
   * Nothing came back: the request may or may not have landed. The same
   * `client_uuid` must be sent again, never a new one — that is what makes the
   * second tap a replay instead of a second debt or a second receipt.
   */
  unknown: boolean;
  /** The debt as it stands, when a repayment refusal carried it (502/503). */
  credit: DebtCredit | null;
  openLines: DebtLine[] | null;
  /** The repayment receipt was rung and then undone by ПРРО (502). */
  saleVoided: boolean;
  /** Figures beside `over_limit`. */
  limit: { balance: number; attempt: number; limit: number; available: number } | null;
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  credit?: unknown;
  open_lines?: unknown;
  sale_voided?: unknown;
  balance_cents?: unknown;
  attempt_cents?: unknown;
  limit_cents?: unknown;
  available_cents?: unknown;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A write that got no answer, said in the words of that write: what may have
 * happened, and that the next tap will not do it twice (it sends the same key).
 */
export function unansweredFailure(text: string): DebtFailure {
  return { text, code: null, status: null, unknown: true, credit: null, openLines: null, saleVoided: false, limit: null };
}

export function debtFailure(e: unknown, fallback: string): DebtFailure {
  const response = (e as { response?: { status?: unknown; data?: unknown } } | null)?.response;
  const status = num(response?.status);
  const body = (response?.data ?? null) as ErrorBody | null;

  let text = fallback;
  if (typeof body?.error === 'string' && body.error.trim()) text = body.error;
  else if (typeof body?.message === 'string' && body.message.trim()) text = body.message;
  else if (!response) text = 'Немає звʼязку з сервером — перевірте мережу і спробуйте ще раз';

  const balance = num(body?.balance_cents);
  const attempt = num(body?.attempt_cents);
  const limit = num(body?.limit_cents);
  const available = num(body?.available_cents);

  return {
    text,
    code: typeof body?.code === 'string' ? body.code : null,
    status,
    unknown: !response,
    credit: body?.credit && typeof body.credit === 'object' ? (body.credit as DebtCredit) : null,
    openLines: Array.isArray(body?.open_lines) ? (body.open_lines as DebtLine[]) : null,
    saleVoided: body?.sale_voided === true,
    limit:
      balance != null && attempt != null && limit != null && available != null
        ? { balance, attempt, limit, available }
        : null,
  };
}
