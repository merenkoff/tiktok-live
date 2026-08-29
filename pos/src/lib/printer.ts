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

export interface ReceiptData {
  store_name: string;
  receipt_number: string;
  created_at: string;
  staff_name: string;
  customer_name: string | null;
  items: ReceiptItem[];
  subtotal_cents: number;
  discount_cents: number | null;
  total_cents: number;
  payments: ReceiptPayment[];
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
