// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The guest's ticket for a kitchen order (РК5, TechDocs/POS_REMOTE_KITCHEN.md
// §8.1): «П-12», the dishes and «буде о 18:40», on the printer the cafe's
// desktop names for this module's station («Обладнання»). A non-fiscal slip
// (`printSlip`, platform 20): the fiscal receipt is the cafe's own and stays
// as it is. The till that took the money prints it once, right after the
// sale; the tracker's «Талон» prints it again.

import { getMeta, printSlip, resolveModuleStationPrinter, type SlipData, type TicketPrinter } from '@pos/platform';
import { REMOTE_KITCHEN_MODULE_ID } from '../lib/hostPlatform';

export const GUEST_TICKET_STATION = 'guest-ticket';

/** A line of the order as the ticket reads it. */
export interface TicketItem {
  product_name: string;
  variant_label?: string | null;
  quantity: number;
  /** The receipt's answers (snapshots with a `name`) once the order is paid. */
  modifiers?: unknown[];
  note?: string | null;
}

/** The fields of the order view the ticket reads. */
export interface TicketOrder {
  order_no: number | null;
  promised_at: string | null;
  kitchen_title?: string | null;
  /** Printed when present; the cafe's till sends none today. */
  guest_label?: string | null;
  items?: TicketItem[];
}

function clock(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** The answers' names: «сирний борт». Anything without a name (a bare id) is left out. */
function answerNames(raw: unknown[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => (m && typeof m === 'object' ? (m as { name?: unknown }).name : null))
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    .map((name) => name.trim());
}

/**
 * «Маргарита 30 см · сирний борт — без цибулі». Two pizzas of one size that
 * differ only by their answers are what the guest matches the boxes by. The
 * caption may already end with the answers (the server's «M · вівсяне»), so
 * they are taken off it first, as the kitchen's ticket does.
 */
function itemName(item: TicketItem): string {
  const answers = answerNames(item.modifiers);
  let label = (item.variant_label ?? '').trim();
  for (const name of [...answers].reverse()) {
    if (label.endsWith(` · ${name}`)) label = label.slice(0, -(name.length + 3));
    else if (label === name) label = '';
  }
  const head = label ? `${item.product_name} ${label}` : item.product_name;
  const withAnswers = answers.length > 0 ? `${head} · ${answers.join(', ')}` : head;
  const note = item.note?.trim();
  return note ? `${withAnswers} — ${note}` : withAnswers;
}

/** The slip, or null for an order the kitchen has not numbered yet. */
export function ticketSlip(order: TicketOrder, printedAt: Date = new Date()): SlipData | null {
  if (order.order_no == null) return null;
  const at = clock(order.promised_at);
  const lines = [
    order.kitchen_title ? `Страви з кухні «${order.kitchen_title}»` : 'Страви з кухні',
    ...(order.guest_label ? [order.guest_label] : []),
    ...(at ? [`Буде о ${at}`] : []),
  ];
  return {
    title: `ТАЛОН П-${order.order_no}`,
    lines,
    items: (order.items ?? []).map((i) => ({ name: itemName(i), quantity: String(i.quantity) })),
    footer: ['Покажіть талон, коли привезуть.'],
    printed_at: printedAt.toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export type TicketOutcome =
  /** No printer for the station on this device (or the web till): nothing printed. */
  { kind: 'none' } | { kind: 'printed'; printer: string } | { kind: 'failed'; error: string };

/** Never throws: a jammed printer must not undo a paid order. */
export async function printGuestTicket(order: TicketOrder): Promise<TicketOutcome> {
  const slip = ticketSlip(order);
  if (!slip) return { kind: 'none' };
  let printer: TicketPrinter | null = null;
  try {
    printer = await resolveModuleStationPrinter(getMeta, REMOTE_KITCHEN_MODULE_ID, GUEST_TICKET_STATION);
  } catch {
    return { kind: 'none' };
  }
  if (!printer) return { kind: 'none' };
  try {
    await printSlip(printer.name, slip, printer.paperWidth);
    return { kind: 'printed', printer: printer.name };
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Is there a printer for the ticket on this device — the tracker draws «Талон» only then. */
export async function hasTicketPrinter(): Promise<boolean> {
  try {
    return (await resolveModuleStationPrinter(getMeta, REMOTE_KITCHEN_MODULE_ID, GUEST_TICKET_STATION)) != null;
  } catch {
    return false;
  }
}
