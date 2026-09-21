// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a bill, as pure arithmetic (phase К4g, TechDocs/POS_TABLES.md §4.4).
//
// The two ways to divide a bill are not two settings of one mechanism, and
// the difference is drawn by law rather than by taste: one sale carries at
// most one fiscal receipt. So dividing the DISHES is several sales, each with
// its own list of goods and its own receipt, while dividing the SUM is one
// sale paid in several rows. The client's whole job is to say which of the
// two the guests asked for; the server does the rest.
//
// Nothing here invents a price. Every figure is Σ of what the rounds LOCKED
// when they fired (К4c) — a bill that reprices itself at payment is the thing
// §4.3 exists to prevent.

import type { Bill, BillLine, BillRound } from './types';

/** A line with the round it belongs to, which is what the payer picks from. */
export interface PayableLine {
  line: BillLine;
  round: BillRound;
}

/**
 * What is still owed: fired, not cancelled, not yet paid for.
 *
 * A draft never appears — the server refuses to put a plate the kitchen has
 * not been told about on a receipt, and offering it here would be offering a
 * refusal.
 */
export function payableLines(bill: Bill): PayableLine[] {
  const out: PayableLine[] = [];
  for (const round of bill.rounds) {
    if (round.cancelled_at != null) continue;
    for (const line of round.items) {
      if (line.sale_id == null) out.push({ line, round });
    }
  }
  return out;
}

/** What one line locked, which is money owed. */
export function lineCents(line: BillLine): number {
  return (line.unit_price_cents ?? 0) * line.quantity;
}

/** Σ of the lines whose ids are selected. */
export function selectionCents(lines: readonly PayableLine[], selected: ReadonlySet<number>): number {
  return lines.reduce((sum, { line }) => (selected.has(line.id) ? sum + lineCents(line) : sum), 0);
}

/**
 * «Порівну на N»: N amounts that add up to the total, to the kopiyka.
 *
 * The remainder goes to the FIRST share rather than the last, because the
 * first is the one the person holding the terminal usually pays: «з мене на
 * копійку більше» is a sentence somebody says out loud, and the last guest
 * being short would be found only when the receipts are added up.
 */
export function evenShares(totalCents: number, ways: number): number[] {
  const n = Math.max(1, Math.floor(ways));
  if (totalCents <= 0) return Array.from({ length: n }, () => 0);
  const base = Math.floor(totalCents / n);
  const shares = Array.from({ length: n }, () => base);
  shares[0] += totalCents - base * n;
  return shares;
}

/** Whether this bill still owes anything at all. */
export function isSettled(bill: Bill): boolean {
  return bill.status !== 'open' || payableLines(bill).length === 0;
}

/** Lines typed but not fired — the server refuses to pay a bill carrying any. */
export function draftBlocksPayment(bill: Bill): boolean {
  return bill.draft.length > 0;
}
