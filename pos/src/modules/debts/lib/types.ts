// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What `/api/pos/debts…` answers (migration 073, src/pos/debts.service.ts).
// The server's view types, copied rather than imported: the module ships on its
// own cadence and speaks to whatever backend the store runs.

import type { SaleDetail, SaleFiscalDoc } from '@pos/platform';

export type DebtEntryKind = 'issue' | 'return' | 'payment' | 'payment_void' | 'writeoff';

/** A customer's credit as the till reads it — the limit is the owner's (decision Д2). */
export interface DebtCredit {
  customer_id: number;
  /** null: this customer may not take goods «під запис». */
  limit_cents: number | null;
  locked: boolean;
  balance_cents: number;
  /** How much more may be given; null without a limit, never below zero. */
  available_cents: number | null;
  set_at: string | null;
  set_by_name: string | null;
}

export type DebtLineStatus = 'open' | 'paid' | 'returned' | 'written_off';

export interface DebtLine {
  id: number;
  entry_id: number;
  created_at: string;
  product_name: string;
  variant_label: string;
  unit: string;
  quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
  unit_price_cents: number;
  line_discount_cents: number;
  line_total_cents: number;
  /** What is still owed — 0 once the line is paid, written off or returned. */
  owed_cents: number;
  status: DebtLineStatus;
  sale_id: number | null;
  receipt_number: string | null;
  note: string;
}

export interface DebtEntry {
  id: number;
  kind: DebtEntryKind;
  /** Signed: what this event did to the balance. */
  amount_cents: number;
  created_at: string;
  staff_name: string | null;
  reason: string | null;
  sale_id: number | null;
  receipt_number: string | null;
  /**
   * A handover a desktop till wrote down without a network and sent later
   * (074). Absent from a backend older than that.
   */
  offline?: boolean;
}

export interface DebtStatement {
  customer: { id: number; name: string; phone: string };
  credit: DebtCredit;
  /** Oldest first — the order a repayment takes them in (decision Д4). */
  open_lines: DebtLine[];
  /** The latest entries of the journal, newest first. */
  entries: DebtEntry[];
  oldest_open_at: string | null;
}

export interface DebtWriteResult {
  entry: DebtEntry;
  lines: DebtLine[];
  credit: DebtCredit;
  open_lines: DebtLine[];
  /** This `client_uuid` had already been written — nothing new happened. */
  replay: boolean;
}

export interface Debtor {
  customer_id: number;
  name: string;
  phone: string;
  balance_cents: number;
  limit_cents: number | null;
  locked: boolean;
  open_lines: number;
  oldest_open_at: string | null;
}

/** The owner's figures for a window — never inside takings (G3_DEBTS.md §4). */
export interface DebtSummary {
  from: string;
  to: string;
  issued_cents: number;
  repaid_cents: number;
  returned_cents: number;
  written_off_cents: number;
  balance_end_cents: number;
  debtors_end: number;
}

export interface PayDebtResult {
  /** The repayment receipt — an ordinary sale. */
  sale: SaleDetail;
  /** The receipt registered by this call; null without ПРРО or while it is still to be. */
  fiscal: SaleFiscalDoc | null;
  /** Set when the money is taken but the receipt is still to be registered. */
  warning: string | null;
  credit: DebtCredit;
  open_lines: DebtLine[];
}

/** One line of the cart, as `POST /debts/issue` takes it. */
export interface IssueItem {
  variant_id: number;
  quantity: number;
  modifiers?: number[];
  note?: string;
}
