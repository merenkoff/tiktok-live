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

export function printReceipt(printerName: string, receipt: ReceiptData): Promise<void> {
  return invoke('print_receipt', { printerName, receipt });
}
