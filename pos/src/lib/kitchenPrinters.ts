// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which printer a station's ticket goes to (café phase К3e), pure.
//
// The station printers are per-device settings in the offline `meta` table,
// next to the receipt printer's (`HardwarePage`). The one rule: the bar falls
// back to the kitchen, never the other way round — a shop with one printer
// puts it in the kitchen and gets every ticket there; a shop with no kitchen
// printer gets no tickets at all, silently, which is what the web shell is.

import { DEFAULT_RECEIPT_PAPER_WIDTH, RECEIPT_PAPER_WIDTHS, type ReceiptPaperWidth } from './printer';

export const KITCHEN_PRINTER_META_KEY = 'kitchenPrinterName';
export const KITCHEN_PAPER_META_KEY = 'kitchenPaperWidthMm';
export const BAR_PRINTER_META_KEY = 'barPrinterName';
export const BAR_PAPER_META_KEY = 'barPaperWidthMm';

export interface TicketPrinter {
  name: string;
  paperWidth: ReceiptPaperWidth;
}

export interface TicketPrinters {
  kitchen: TicketPrinter | null;
  /** The bar's own printer, or the kitchen's when none is set. */
  bar: TicketPrinter | null;
}

/** A `meta` reader — `getMeta` from the offline db, or a stub in a test. */
export type MetaReader = <T>(key: string) => Promise<T | undefined>;

function paperOf(value: unknown): ReceiptPaperWidth {
  return RECEIPT_PAPER_WIDTHS.includes(value as ReceiptPaperWidth)
    ? (value as ReceiptPaperWidth)
    : DEFAULT_RECEIPT_PAPER_WIDTH;
}

function printerOf(name: unknown, paper: unknown): TicketPrinter | null {
  return typeof name === 'string' && name.trim() ? { name, paperWidth: paperOf(paper) } : null;
}

/** Resolve both station printers from the device's settings. */
export async function resolveTicketPrinters(read: MetaReader): Promise<TicketPrinters> {
  const [kitchenName, kitchenPaper, barName, barPaper] = await Promise.all([
    read<unknown>(KITCHEN_PRINTER_META_KEY),
    read<unknown>(KITCHEN_PAPER_META_KEY),
    read<unknown>(BAR_PRINTER_META_KEY),
    read<unknown>(BAR_PAPER_META_KEY),
  ]);
  const kitchen = printerOf(kitchenName, kitchenPaper);
  if (!kitchen) return { kitchen: null, bar: null };
  return { kitchen, bar: printerOf(barName, barPaper) ?? kitchen };
}
