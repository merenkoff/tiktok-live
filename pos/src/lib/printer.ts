// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { invoke } from '@tauri-apps/api/core';

export interface PrinterInfo {
  name: string;
  is_default: boolean;
}

export interface ReceiptItem {
  name: string;
  variant_label: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  /** Letter of the VAT rate (рядок 11 of Положення № 13); absent in a non-fiscal store. */
  tax_symbol?: string | null;
}

/**
 * Рядки 1–5: who sold and where, as the ПРРО provider has it registered.
 * Absent for a store that does not fiscalise — its paper stays as it was.
 */
export interface ReceiptHeader {
  org_name: string | null;
  point_name: string | null;
  address: string | null;
  /** «ПН 1234567890» for a VAT payer, «ІД 12345678» otherwise. */
  tax_id_line: string | null;
}

/** Рядок 21: one «ПДВ» line per rate letter. */
export interface ReceiptVatLine {
  symbol: string;
  rate: number;
  amount_cents: number;
}

export interface ReceiptPayment {
  method: string;
  amount_cents: number;
}

/** A refund prints as its own document referencing the sale it undoes. */
export type ReceiptKind = 'sale' | 'refund';

/** The ПРРО result our own layout prints as a fiscal block. */
export interface ReceiptFiscal {
  fiscal_code: string;
  /** Already formatted for the paper, like `created_at`. */
  fiscal_date: string | null;
  /** Tax-office verification link — printed as a QR on ESC/POS, as a link on paper-less PDF. */
  tax_url: string | null;
  /**
   * Stamped from the offline reserve: the paper must carry the «ОФЛАЙН» mark.
   * Optional so a Rust build that predates it keeps printing the online block.
   */
  offline?: boolean;
  /**
   * Контрольне число — part of an offline receipt's required content. Null
   * while the document has not reached the provider yet, which is exactly the
   * case the cashier must not mistake for a complete receipt.
   */
  control_number?: string | null;
  /** Рядок 34: «ФН ПРРО …». Cached from the provider; null before the first online contact. */
  register_fiscal_number?: string | null;
  /** Рядок 31: the mode mark is printed on every ПРРО receipt, «ОНЛАЙН» included. */
  mode?: 'online' | 'offline';
  /** Рядок 35: the ПРРО software's name next to «ФІСКАЛЬНИЙ ЧЕК». */
  producer?: string | null;
}

export interface ReceiptData {
  store_name: string;
  kind: ReceiptKind;
  receipt_number: string;
  /** Sale this refund is against; null on a normal sale receipt. */
  refund_of_receipt: string | null;
  /**
   * The short daily number the counter calls out, printed large above the
   * receipt number. Only a café sets it; absent on an older host, and a Rust
   * build that predates it ignores it.
   */
  order_no?: number | null;
  /**
   * The till's own «К17» for a receipt printed before the sale reached the
   * server (К3d). Printed in the same place and size as `order_no`, which wins
   * when both are present. Absent on an older host; ignored by an older Rust.
   */
  order_label?: string | null;
  created_at: string;
  staff_name: string;
  customer_name: string | null;
  items: ReceiptItem[];
  subtotal_cents: number;
  discount_cents: number | null;
  total_cents: number;
  payments: ReceiptPayment[];
  /**
   * The fiscal provider's own pre-rendered receipt. When present it is
   * printed verbatim and every other field is ignored — the store chose
   * `receipt_source: 'provider'` and the text arrived. Optional so an older
   * host or Rust build that predates it keeps printing the layout.
   */
  provider_text?: string | null;
  /** Fiscal block for our own layout. Null/absent for a non-fiscal store. */
  fiscal?: ReceiptFiscal | null;
  /** Рядки 1–5. Absent for a non-fiscal store. */
  header?: ReceiptHeader | null;
  /** Рядок 21. Empty/absent when the store is not a VAT payer or has no rate table. */
  vat_lines?: ReceiptVatLine[];
  /** Рядок 25: cash handed back. Null when nothing was. */
  change_cents?: number | null;
}

export function listPrinters(): Promise<PrinterInfo[]> {
  return invoke('list_printers');
}

/** Thermal roll width in millimetres. 58mm ≈ 32 chars/line, 80mm ≈ 48. */
export type ReceiptPaperWidth = 58 | 80;

export const RECEIPT_PAPER_WIDTHS: ReceiptPaperWidth[] = [58, 80];
export const DEFAULT_RECEIPT_PAPER_WIDTH: ReceiptPaperWidth = 58;

export function printReceipt(
  printerName: string,
  receipt: ReceiptData,
  paperWidthMm: ReceiptPaperWidth = DEFAULT_RECEIPT_PAPER_WIDTH,
): Promise<void> {
  return invoke('print_receipt', { printerName, receipt, paperWidthMm });
}

/** One line of a kitchen ticket — what to make, how many, and how. */
export interface KitchenTicketItem {
  name: string;
  variant_label: string;
  quantity: number;
  /** The answers the line chose, by name — «вівсяне», «без цукру». */
  modifiers: string[];
  /** The kitchen note for this line. */
  note: string | null;
}

/**
 * A kitchen ticket (café phase К3e): not a receipt — no prices, no fiscal
 * block — but the order number at triple size, the station it is for and one
 * loud line per item. Built by `lib/kitchenTicket.ts`, drawn by Rust
 * `hardware/kitchen_ticket.rs`.
 */
export interface KitchenTicketData {
  /** What the counter calls out: the server's «17», or the till's own «К17». */
  order_label: string;
  /** «КУХНЯ» / «БАР»; null when the store routes nothing by station. */
  station: string | null;
  /** Already formatted — the time the sale was rung. */
  created_at: string;
  staff_name: string;
  /** The order-level note, if any. */
  note: string | null;
  /** Small, at the bottom: what to look for on the till if something is off. */
  receipt_number: string | null;
  items: KitchenTicketItem[];
}

/** Print one kitchen ticket to a named OS printer — the Rust `print_kitchen_ticket` command. */
export function printKitchenTicket(
  printerName: string,
  ticket: KitchenTicketData,
  paperWidthMm: ReceiptPaperWidth
): Promise<void> {
  return invoke('print_kitchen_ticket', { printerName, ticket, paperWidthMm });
}

/** One line of a pre-bill: what was served, how many, at what the round locked. */
export interface PrecheckItem {
  name: string;
  /** Composed by the round when it fired — modifiers included. */
  variant_label: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

/**
 * A pre-bill (tables phase К4h): what the guests are handed when they ask for
 * the bill. Deliberately not a receipt — no «ЧЕК №», no fiscal block, no
 * tax-office QR — and it says so on the paper twice, because under Закон
 * 265/95-ВР the settlement document is the fiscal receipt and this is not it.
 * Built by `modules/tables/lib/precheck.ts`, drawn by Rust
 * `hardware/precheck.rs`.
 */
export interface PrecheckData {
  table_name: string;
  hall_name: string;
  bill_no: number | null;
  guests: number | null;
  /** Already formatted — when the table was seated. */
  opened_at: string;
  /** Already formatted — now. */
  printed_at: string;
  waiter_name: string;
  items: PrecheckItem[];
  total_cents: number;
}

/** Print one pre-bill to a named OS printer — the Rust `print_precheck` command. */
export function printPrecheck(
  printerName: string,
  bill: PrecheckData,
  paperWidthMm: ReceiptPaperWidth = DEFAULT_RECEIPT_PAPER_WIDTH
): Promise<void> {
  return invoke('print_precheck', { printerName, bill, paperWidthMm });
}
