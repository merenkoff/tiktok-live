// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/guest-bill.ts — the bill of a table, as the guest at it
// reads it. TechDocs/POS_QR_MENU.md, phase Q5.
//
// A PROJECTION written straight from the tables, not `bills.getBill`. That
// answer carries the names of the waiters, the guest count, the bill note, the
// customer id, the bill number and the waiter's unsent draft — none of which
// is the guest's business, and the draft is not even owed yet. Every field that
// leaves is named here, and `pos.guest-bill.test.ts` pins the exact key set, so
// a column added to the bill later stays behind by default.
//
// What the guest is told is what the ROUNDS locked: prices are the ones fixed
// when a round went to the kitchen («До сплати»), a cancelled round owes
// nothing and is not shown, and lines a split already paid are marked, not
// counted again in what is left. Money and times arrive as text so the page's
// script does no arithmetic of its own.

import { pool } from '../../db.js';
import { readStoreClock } from '../core/storeClock.js';
import { formatUahGuestCompact, tableLabel } from './format.js';
import type { MenuTable } from './menu.service.js';

export interface GuestBillLine {
  name: string;
  /** The size and answers, already composed («M · вівсяне»); empty for a plain dish. */
  caption: string;
  quantity: number;
  price_text: string;
  total_text: string;
  /** A part of a split already paid for this line. */
  paid: boolean;
}

export interface GuestBillRound {
  seq: number;
  /** Store-local `HH:MM` the round went to the kitchen. */
  at: string;
  /** cooking → ready (the kitchen is done) → served (on the table). */
  status: 'cooking' | 'ready' | 'served';
  lines: GuestBillLine[];
}

export interface GuestBill {
  table: string;
  hall: string;
  /** No open bill: the waiter has not opened one, or the table was paid. */
  open: boolean;
  generated_at: string;
  rounds: GuestBillRound[];
  /** Still owed: the fired lines no split has paid. */
  to_pay_cents: number;
  to_pay_text: string;
  /** What splits have already taken, or null while nothing is paid. */
  paid_text: string | null;
}

const STATUS = { new: 'cooking', ready: 'ready', served: 'served' } as const;

function timeOf(value: unknown, timezone: string): string {
  return new Date(value as string).toLocaleTimeString('uk-UA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** The open bill of `table`, or a closed one when there is none. The caller has already checked the table's key. */
export async function loadGuestBill(storeId: number, table: MenuTable): Promise<GuestBill> {
  const base = {
    table: tableLabel(table.name),
    hall: table.hall,
    generated_at: new Date().toISOString(),
  };
  const head = await pool.query(
    `SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2 AND status = 'open'`,
    [storeId, table.id]
  );
  if (head.rows.length === 0) {
    return { ...base, open: false, rounds: [], to_pay_cents: 0, to_pay_text: formatUahGuestCompact(0), paid_text: null };
  }
  const billId = Number(head.rows[0].id);
  const clock = await readStoreClock(storeId);

  const rounds = await pool.query(
    `SELECT id, seq, fired_at, prep_status
       FROM pos_bill_rounds
      WHERE bill_id = $1 AND cancelled_at IS NULL
      ORDER BY seq ASC`,
    [billId]
  );
  // Joined to the live rounds, so a cancelled round's lines can neither be
  // shown nor counted: its stock went back and its plates were never served.
  const items = await pool.query(
    `SELECT i.round_id, i.product_name, i.variant_label, i.quantity, i.unit_price_cents,
            (i.sale_id IS NOT NULL) AS paid
       FROM pos_bill_items i
       JOIN pos_bill_rounds r ON r.id = i.round_id AND r.cancelled_at IS NULL
      WHERE i.bill_id = $1
      ORDER BY i.sort_order ASC, i.id ASC`,
    [billId]
  );

  const linesByRound = new Map<number, GuestBillLine[]>();
  let toPay = 0;
  let paid = 0;
  for (const row of items.rows) {
    const unit = Number(row.unit_price_cents ?? 0);
    const quantity = Number(row.quantity);
    const isPaid = row.paid === true;
    if (isPaid) paid += unit * quantity;
    else toPay += unit * quantity;
    const roundId = Number(row.round_id);
    linesByRound.set(roundId, [
      ...(linesByRound.get(roundId) ?? []),
      {
        name: String(row.product_name ?? ''),
        caption: String(row.variant_label ?? ''),
        quantity,
        price_text: formatUahGuestCompact(unit),
        total_text: formatUahGuestCompact(unit * quantity),
        paid: isPaid,
      },
    ]);
  }

  const shown: GuestBillRound[] = [];
  for (const round of rounds.rows) {
    const lines = linesByRound.get(Number(round.id)) ?? [];
    if (lines.length === 0) continue;
    shown.push({
      seq: Number(round.seq),
      at: timeOf(round.fired_at, clock.timezone),
      status: STATUS[round.prep_status as keyof typeof STATUS] ?? 'cooking',
      lines,
    });
  }

  return {
    ...base,
    open: true,
    rounds: shown,
    to_pay_cents: toPay,
    to_pay_text: formatUahGuestCompact(toPay),
    paid_text: paid > 0 ? formatUahGuestCompact(paid) : null,
  };
}
