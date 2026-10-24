// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Rounding the cash total of a receipt (Постанова НБУ від 15.03.2018 № 25;
// TechDocs/POS_CASH_ROUNDING.md) — the till's copy of `src/pos/cashRounding.ts`.
//
// A shop without small coins rounds what the customer pays IN CASH: to 10
// kopecks (п. 4) or, without 10-kopeck coins, to 50 (п. 4-1). Card and QR are
// never rounded (п. 6), so in a mixed payment only the part left for cash is,
// and a cash refund rounds the money handed back. The till shows the rounded
// sum before the server has seen the sale, and the offline till prints it on a
// receipt the server files hours later, so this must agree with the server to
// the kopeck: `cashRounding.test.ts` pins the server's own three tables.

/** Kopecks the cash total is rounded to; 0 = not rounded. */
export type CashRoundingStep = 0 | 10 | 50;

export const CASH_ROUNDING_STEPS: readonly CashRoundingStep[] = [0, 10, 50];

export function isCashRoundingStep(value: unknown): value is CashRoundingStep {
  return value === 0 || value === 10 || value === 50;
}

/**
 * What a sum of `amountCents` is rounded BY, signed: −23 means the customer
 * pays 23 kopecks less, +20 that they pay 20 more. Zero for a step of 0, a
 * sum already on the step, or nothing to round.
 */
export function cashRoundingDelta(amountCents: number, step: CashRoundingStep): number {
  if (step === 0 || !Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const rest = Math.round(amountCents) % step;
  if (rest === 0) return 0;
  // Both rules are «half up» on their own step: below 5 (or 25) goes down,
  // from 5 (or 25) up — 25 kopecks rounds up to 50 under п. 4-1.
  return rest < step / 2 ? -rest : step - rest;
}

export interface CashRoundingPayment {
  method: string;
  amount_cents: number;
}

/**
 * The part of a receipt left for cash once the card and QR rows are counted.
 * Never below zero: a card row larger than the total leaves nothing for cash.
 */
export function cashPartCents(totalCents: number, payments: CashRoundingPayment[]): number {
  const cashless = payments
    .filter((p) => p.method !== 'cash')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  return Math.max(0, totalCents - cashless);
}

/**
 * The rounding of a sale: the cash part of `totalCents`, rounded by `step` —
 * and nothing at all when no payment row is cash (п. 6).
 */
export function saleRoundingCents(
  totalCents: number,
  payments: CashRoundingPayment[],
  step: CashRoundingStep
): number {
  if (step === 0 || !payments.some((p) => p.method === 'cash')) return 0;
  return cashRoundingDelta(cashPartCents(totalCents, payments), step);
}

/** The rounding of a refund: only money handed back in cash is rounded. */
export function refundRoundingCents(
  totalCents: number,
  method: string | null | undefined,
  step: CashRoundingStep
): number {
  return method === 'cash' ? cashRoundingDelta(totalCents, step) : 0;
}

/**
 * The store's step as the login carries it: anything that is not 10 or 50 —
 * absent on an older cached auth, or a value this build does not know — is 0,
 * the behaviour from before rounding existed. Never throws: the till must
 * keep selling.
 */
export function storeCashRounding(value: unknown): CashRoundingStep {
  return value === 10 || value === 50 ? value : 0;
}
