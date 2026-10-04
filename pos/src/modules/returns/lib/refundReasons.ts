// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a return says about itself, in the words the law uses (clothing
// R1/R2/R4, TechDocs/POS_CLOTHING.md «R1/R2/R4»): the ground the customer
// named, the method the money goes back by, the act the tax rules want
// above 100 ₴, and the fourteen days of ст. 9. Pure, so the dialog and the
// pages read one table and the tests pin it.

import type { PaymentMethod, RefundReasonCode, SaleDetail } from '@pos/platform';

/** Ст. 9 (did not fit) first, ст. 8 (defective) next, a catch-all last. */
export const REFUND_REASONS: ReadonlyArray<{ code: RefundReasonCode; label: string }> = [
  { code: 'size', label: 'Не підійшов розмір' },
  { code: 'color', label: 'Не підійшов колір' },
  { code: 'style', label: 'Не підійшов фасон' },
  { code: 'defect', label: 'Брак' },
  { code: 'other', label: 'Інше' },
];

export function reasonLabel(code: RefundReasonCode | null | undefined): string | null {
  return REFUND_REASONS.find((r) => r.code === code)?.label ?? null;
}

/**
 * Порядок № 547 розд. ІІІ п. 8: more than 100 ₴ handed back wants an «Акт
 * про видачу коштів» with the buyer's document on it.
 */
export const ACT_THRESHOLD_CENTS = 100_00;

export function needsAct(totalCents: number): boolean {
  return totalCents > ACT_THRESHOLD_CENTS;
}

/** ЗУ «Про захист прав споживачів» ст. 9: fourteen days, not counting the day of purchase. */
export const EXCHANGE_DAYS = 14;

/**
 * Calendar days since the purchase, the purchase day itself not counted —
 * bought on the 1st, the 2nd is day one and the 15th is the last day of the
 * fourteen. On the device's calendar; this is a hint for the cashier, never a
 * gate, so the store's own time zone is not worth a request.
 */
export function daysSincePurchase(createdAt: string, now: Date = new Date()): number {
  const bought = new Date(createdAt);
  if (Number.isNaN(bought.getTime())) return 0;
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(now) - start(bought)) / 86_400_000));
}

const METHOD_ORDER: PaymentMethod[] = ['cash', 'card', 'qr'];

export const PAYMENT_LABEL_UK: Record<PaymentMethod, string> = {
  cash: 'Готівка',
  card: 'Картка',
  qr: 'QR-код',
};

/** How the money goes back, on the act: «готівкою» / «на платіжну картку» / «безготівково». */
export const RETURNED_BY_UK: Record<PaymentMethod, string> = {
  cash: 'готівкою',
  card: 'на платіжну картку',
  qr: 'безготівково (QR)',
};

/**
 * The methods the receipt was paid with, in the till's order. The server
 * refuses any other method for the refund (card money goes back to the
 * card), so these are the only ones the dialog may offer.
 */
export function paidMethods(detail: SaleDetail | null | undefined): PaymentMethod[] {
  const seen = new Set((detail?.payments ?? []).map((p) => p.method));
  return METHOD_ORDER.filter((m) => seen.has(m));
}

/** The method to pre-select: how they paid, or cash when the receipt names no payment. */
export function defaultRefundMethod(detail: SaleDetail | null | undefined): PaymentMethod {
  return paidMethods(detail)[0] ?? 'cash';
}

/**
 * The sentence to show for a failed refund: the server's own words first
 * (`{ error: '…' }` on a 400), then the error's message, then the fallback.
 * Without this a 400 reads «Request failed with status code 400».
 */
export function refundErrorText(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null) {
    const data = (e as { response?: { data?: { error?: unknown; message?: unknown } } }).response?.data;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  }
  if (e instanceof Error && e.message && !/^Request failed with status code/.test(e.message)) {
    return e.message;
  }
  return fallback;
}
