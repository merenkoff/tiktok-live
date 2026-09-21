// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Building the pre-bill (phase К4h, TechDocs/POS_TABLES.md §4.5).
//
// Pure, and apart from the screen, because what goes on that paper is a legal
// question rather than a layout one: it lists what the rounds LOCKED and
// nothing else. A draft line never appears — the kitchen has not been told
// about it, so the guests are not being asked to pay for it — and neither
// does a line another guest has already paid for.
//
// The Rust side draws it (`hardware/precheck.rs`) and owns the two lines that
// do the work: «ПЕРЕДЧЕК» and «НЕ Є РОЗРАХУНКОВИМ ДОКУМЕНТОМ». This side only
// decides what is on the bill.

import type { PrecheckData, PrecheckItem } from '@pos/platform';
import { lineCents, payableLines } from './pay';
import type { Bill } from './types';

/** `HH:MM` on the device's clock, or '' for a timestamp we cannot read. */
export function clockTime(iso: string | null | undefined, now: Date = new Date()): string {
  const at = iso == null ? now : new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/**
 * What the guests get on paper.
 *
 * The total is Σ of the lines listed, not `bill.fired_total_cents`: after one
 * guest of a split has paid, the paper must say what is still owed, and the
 * bill's own total says what the evening came to.
 */
export function buildPrecheck(bill: Bill, now: Date = new Date()): PrecheckData {
  const owed = payableLines(bill);
  const items: PrecheckItem[] = owed.map(({ line }) => ({
    name: line.product_name,
    // The caption the round composed when it fired, answers included — the
    // same string the fiscal receipt will carry, so the two papers agree.
    variant_label: line.variant_label,
    quantity: line.quantity,
    unit_price_cents: line.unit_price_cents ?? 0,
    line_total_cents: lineCents(line),
  }));
  return {
    table_name: bill.table_name,
    hall_name: bill.hall_name,
    bill_no: bill.bill_no,
    guests: bill.guests,
    opened_at: clockTime(bill.opened_at, now),
    printed_at: clockTime(null, now),
    waiter_name: bill.opened_by_name,
    items,
    total_cents: items.reduce((sum, i) => sum + i.line_total_cents, 0),
  };
}
