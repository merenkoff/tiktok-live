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
}

export interface ReceiptData {
  store_name: string;
  kind: ReceiptKind;
  receipt_number: string;
  /** Sale this refund is against; null on a normal sale receipt. */
  refund_of_receipt: string | null;
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
