// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers for the bill screen (phase К4f). Apart from the page so the
// two questions a waiter reads off it — what is owed, and what is still only
// typed — are testable without rendering anything.

import type { Bill, BillLine, BillRound } from './types';

/** What a round's state says, in the kitchen's own words. */
export const ROUND_STATUS: Record<BillRound['prep_status'], string> = {
  new: 'готується',
  ready: 'готово',
  served: 'видано',
};

/** Rounds that count, oldest first. A cancelled one stays, but owes nothing. */
export function liveRounds(bill: Bill): BillRound[] {
  return bill.rounds.filter((r) => r.cancelled_at == null);
}

/**
 * A round can be taken back until it is handed over.
 *
 * `served` is the line: a dish that reached the guest is RETURNED, not
 * cancelled, and returning it is a refund (К4d). The server refuses it in
 * those words; the screen simply does not offer the button.
 */
export function canCancelRound(round: BillRound): boolean {
  return round.cancelled_at == null && round.prep_status !== 'served';
}

/**
 * What one draft line would cost at today's prices — or null when nobody can
 * say yet.
 *
 * A line assembled at the counter is priced from its parts when the round is
 * fired, and guessing here would put a second number next to the server's.
 */
export function previewLineCents(line: BillLine): number | null {
  if (line.preview_unit_price_cents == null) return null;
  return line.preview_unit_price_cents * line.quantity;
}

/** What a fired line locked, which is money owed. */
export function firedLineCents(line: BillLine): number {
  return (line.unit_price_cents ?? 0) * line.quantity;
}

/**
 * The two sums a bill carries, deliberately named apart.
 *
 * `owed` is what the rounds locked when they fired — real money the guest
 * will pay. `draft` is what the untyped-yet half would come to at today's
 * prices: indicative, not owed, and it disappears the moment «На кухню» turns
 * it into the first kind. Adding them into one figure is exactly the mistake
 * §4.3 warns about — a bill that quietly reprices itself mid-dinner.
 */
export function billTotals(bill: Bill): { owed: number; draft: number; draftExact: boolean } {
  return {
    owed: bill.fired_total_cents,
    draft: bill.draft_preview_cents,
    // False when any draft line could not be previewed, so the screen can say
    // «≈» rather than pretend the number is complete.
    draftExact: bill.draft.every((l) => l.preview_unit_price_cents != null),
  };
}

/**
 * The caption a line shows: the product, then what distinguishes it.
 *
 * The asymmetry is the server's and worth knowing: a FIRED line carries the
 * caption the round composed («Лате M · вівсяне · без цукру»), modifiers
 * included, because that string is what the receipt and the fiscal line will
 * carry. A DRAFT line has no snapshot yet — its label is the plain variant —
 * so the answers are appended here, or two lattes differing only in the milk
 * would read identically while the waiter is still able to fix them.
 */
export function lineTitle(line: BillLine, fired = false): string {
  const base = line.variant_label
    ? `${line.product_name} · ${line.variant_label}`
    : line.product_name;
  if (fired || line.modifiers.length === 0) return base;
  return `${base} · ${line.modifiers.map((m) => m.name).join(' · ')}`;
}
