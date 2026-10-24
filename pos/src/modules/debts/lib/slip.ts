// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «ПІД ЗАПИС» slip — what the customer can be handed when goods go to
// their tab (G3_DEBTS.md §5 decision 14, §6).
//
// Not printed by default (the owner's decision of 2026-10-23): only a desktop
// till whose «Обладнання» names a printer for the station «Квитанції під
// запис» prints one, and then on every handover. No fallback to the receipt
// printer — a slip nobody asked for, on the roll the fiscal receipts come out
// of, is exactly what scheme A rules out.
//
// It is not a settlement document, and the host's `print_slip` makes sure the
// paper says so twice whatever this file sends; this file keeps to words the
// Rust side accepts (no «ЧЕК» in the title, no «До сплати» in a total).

import { getMeta, printSlip, resolveModuleStationPrinter } from '@pos/platform';
import type { SlipData, TicketPrinter } from '@pos/platform';
import { lineTitle, quantityText } from './debt';
import { DEBTS_MODULE_ID, DEBTS_SLIP_STATION } from './ids';
import type { DebtLine } from './types';


/** One line as the slip prints it: what, how much, at what, for how much. */
export interface SlipLine {
  title: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
}

export interface IssueSlipInput {
  storeName: string;
  customer: { name: string; phone?: string | null };
  staffName: string;
  /** The journal entry, when the server wrote it; null when the till wrote it down offline. */
  entryId: number | null;
  at: Date;
  lines: SlipLine[];
  /** The cart discount when the lines are the till's own (offline); already inside the server's lines. */
  discountCents: number;
  totalCents: number;
  /** The debt after this handover, when the till knows it. */
  balanceAfterCents: number | null;
  note: string | null;
}

function stamp(at: Date): string {
  return at.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The server's lines: each at its locked total, the cart discount already shared into them. */
export function slipLinesFromServer(lines: readonly DebtLine[]): SlipLine[] {
  return lines.map((line) => ({
    title: lineTitle(line),
    quantity: line.quantity,
    unit: line.unit,
    unitPriceCents: line.unit_price_cents,
    totalCents: line.line_total_cents,
  }));
}

export function buildIssueSlip(input: IssueSlipInput): SlipData {
  const offline = input.entryId == null;
  return {
    title: 'ПІД ЗАПИС',
    store_name: input.storeName,
    lines: [
      `Покупець: ${input.customer.name}`,
      ...(input.customer.phone ? [`Телефон: ${input.customer.phone}`] : []),
      `Касир: ${input.staffName}`,
      offline ? 'Записано на касі без мережі' : `Запис № ${input.entryId}`,
      stamp(input.at),
      ...(input.note ? [`Примітка: ${input.note}`] : []),
    ],
    items: input.lines.map((line) => ({
      name: line.title,
      quantity: quantityText(line.quantity, line.unit),
      unit_price_cents: line.unitPriceCents,
      line_total_cents: line.totalCents,
    })),
    totals: [
      ...(input.discountCents > 0 ? [{ label: 'Знижка', amount_cents: input.discountCents }] : []),
      { label: 'Під запис', amount_cents: input.totalCents },
      ...(input.balanceAfterCents != null
        ? [{ label: offline ? 'Борг після, за даними каси' : 'Борг після', amount_cents: input.balanceAfterCents }]
        : []),
    ],
    footer: ['Фіскальний чек — коли борг буде оплачено.', 'Підпис покупця ________________'],
    printed_at: stamp(new Date()),
  };
}

export type SlipOutcome =
  /** No printer for the station on this device: nothing printed, nothing to say. */
  | { kind: 'none' }
  | { kind: 'printed'; printer: string }
  | { kind: 'failed'; printer: string; error: string };

/**
 * Print the slip if this device has a printer for the station; never throws —
 * a jammed printer must not undo a handover that already happened.
 */
export async function printIssueSlip(slip: SlipData): Promise<SlipOutcome> {
  let printer: TicketPrinter | null = null;
  try {
    printer = await resolveModuleStationPrinter(getMeta, DEBTS_MODULE_ID, DEBTS_SLIP_STATION);
  } catch {
    return { kind: 'none' };
  }
  if (!printer) return { kind: 'none' };
  try {
    await printSlip(printer.name, slip, printer.paperWidth);
    return { kind: 'printed', printer: printer.name };
  } catch (e) {
    return { kind: 'failed', printer: printer.name, error: e instanceof Error ? e.message : String(e) };
  }
}
