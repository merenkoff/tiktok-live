// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's calls into `/api/pos/debts…`, all through the host's one client
// so the token, the base URL and the version header stay the host's business.

import { api } from '@pos/platform';
import type { CartDiscount } from '@pos/platform';
import type {
  DebtCredit,
  DebtStatement,
  DebtSummary,
  DebtWriteResult,
  Debtor,
  IssueItem,
  PayDebtResult,
} from './types';

/**
 * `api.posRequest`, called as a METHOD: it reaches its axios client through
 * `this`, and a detached call fails inside the host before any request leaves
 * the page (the kitchen board lost an afternoon to that, К3c).
 */
function request<T>(method: 'get' | 'post' | 'patch', path: string, body?: unknown): Promise<T> {
  return api.posRequest<T>(method, path, body);
}

export interface PaymentRow {
  method: 'cash' | 'card';
  amount_cents: number;
}

/** The next line after the whole ones, taken partly: some of its units, a «внесок», or both. */
export interface DebtPart {
  line_id: number;
  quantity?: number;
  amount_cents?: number;
  method: 'cash' | 'card';
}

export const debtsApi = {
  /** Who owes the shop; `all` adds the customers with a limit and no debt. */
  debtors(all = false): Promise<{ debtors: Debtor[] }> {
    return request('get', all ? '/debts?all=1' : '/debts');
  },

  statement(customerId: number): Promise<DebtStatement> {
    return request('get', `/debts/customers/${customerId}`);
  },

  /** What the till's strip shows: owed, the limit, how much more. */
  balance(customerId: number): Promise<DebtCredit> {
    return request('get', `/debts/customers/${customerId}/balance`);
  },

  /** The owner's: give, change or take away the limit, lock or unlock. */
  setCredit(
    customerId: number,
    patch: { credit_limit_cents?: number | null; credit_locked?: boolean }
  ): Promise<DebtCredit> {
    return request('patch', `/debts/customers/${customerId}/credit`, patch);
  },

  issue(body: {
    customer_id: number;
    items: IssueItem[];
    cart_discount: CartDiscount | null;
    client_uuid: string;
    note?: string;
    /**
     * When the goods left, for a handover the desktop wrote down without a
     * network (074): the server dates the entry by it and marks it, and does
     * not refuse it for the limit — the goods are already gone.
     */
    offline_at?: string;
  }): Promise<DebtWriteResult> {
    return request('post', '/debts/issue', body);
  },

  returnGoods(
    customerId: number,
    body: { lines: Array<{ line_id: number; quantity: number }>; client_uuid: string; reason?: string }
  ): Promise<DebtWriteResult> {
    return request('post', `/debts/customers/${customerId}/return`, body);
  },

  writeOff(
    customerId: number,
    body: { line_ids?: number[]; reason: string; client_uuid: string }
  ): Promise<DebtWriteResult> {
    return request('post', `/debts/customers/${customerId}/writeoff`, body);
  },

  /**
   * A repayment: the oldest lines whole (`line_ids`), and — on a backend with
   * 078 — some units of the next one and a «внесок» toward it (`part`,
   * G3_DEBTS.md §11). `payments` pays the receipt and is empty when the
   * request is only a «внесок».
   */
  pay(
    customerId: number,
    body: {
      line_ids?: number[];
      part?: DebtPart;
      payments: PaymentRow[];
      client_uuid: string;
      cash_rounding: number;
    }
  ): Promise<PayDebtResult> {
    return request('post', `/debts/customers/${customerId}/pay`, body);
  },

  /**
   * Undo a «внесок» (078): the server voids it, the money goes back and the
   * sum is owed again. Refused once its goods were closed or written off.
   */
  voidPrepayment(saleId: number): Promise<unknown> {
    return request('post', `/sales/${saleId}/void`);
  },

  /** The owner's figures for the window «Сьогодні» is showing. */
  summary(from: string, to: string): Promise<DebtSummary> {
    const q = new URLSearchParams({ from, to });
    return request('get', `/debts/summary?${q.toString()}`);
  },
};
