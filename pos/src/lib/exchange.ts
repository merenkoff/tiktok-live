// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sentences an exchange says about money (clothing R1). Both receipts
// are for their full amounts — ЗУ 265/95-ВР: a return receipt for the old
// goods, a sale receipt for the new, never one receipt «на різницю» — so what
// actually moves across the counter is the difference, and these are the
// only places it is named: before the exchange, on the payment screen, and
// after it, on the success screen. Pure, so both screens and the tests read
// one table.

import { formatUah } from './money';
import type { ExchangeDraft, PaymentMethod } from '../types';

/** How the NEW receipt is paid, in the sentence. */
export const PAID_BY_UK: Record<PaymentMethod, string> = {
  cash: 'готівкою',
  card: 'карткою',
  qr: 'за QR-кодом',
};

/** How the return receipt pays out — the dialog locked it to how the receipt was paid. */
export const RETURNED_TO_UK: Record<PaymentMethod, string> = {
  cash: 'готівкою',
  card: 'на картку',
  qr: 'безготівково',
};

/** Before: what the cashier is about to take or hand over. */
export function differenceSentence(
  differenceCents: number,
  draft: ExchangeDraft,
  method: PaymentMethod
): string {
  if (differenceCents > 0) return `Клієнт доплачує ${formatUah(differenceCents)} ${PAID_BY_UK[method]}`;
  if (differenceCents < 0) {
    return `Повернути клієнту ${formatUah(-differenceCents)} ${RETURNED_TO_UK[draft.refund.method]}`;
  }
  return 'Без доплати — суми рівні';
}

/** After: what crossed the counter, once it has. */
export function exchangeOutcome(differenceCents: number): string {
  if (differenceCents > 0) return `Клієнт доплатив ${formatUah(differenceCents)}`;
  if (differenceCents < 0) return `Повернуто клієнту ${formatUah(-differenceCents)}`;
  return 'Без доплати — суми рівні';
}
