// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { buildReceiptPayload, buildRefundReceiptPayload } from '../lib/receipt';
export {
  listPrinters,
  printReceipt,
  // The pre-bill (К4h). Here rather than in the `tables` module because the
  // Tauri command it wraps is the host's to own — a module reaching `invoke`
  // itself would bundle a second copy of the API and bypass this contract.
  printPrecheck,
  // A feature module's own non-fiscal slip (phase Г2) — host-owned for the
  // same reason as the pre-bill.
  printSlip,
  RECEIPT_PAPER_WIDTHS,
  DEFAULT_RECEIPT_PAPER_WIDTH,
} from '../lib/printer';
export type {
  PrinterInfo,
  ReceiptItem,
  ReceiptPayment,
  ReceiptKind,
  ReceiptData,
  ReceiptPaperWidth,
  PrecheckItem,
  PrecheckData,
  SlipItem,
  SlipTotal,
  SlipData,
} from '../lib/printer';
// Which printer a module's station prints to on this device (Г2):
// `resolveModuleStationPrinter(getMeta, moduleId, stationId)`.
export { moduleStationMetaKeys, resolveModuleStationPrinter } from '../lib/kitchenPrinters';
export type { MetaReader, TicketPrinter } from '../lib/kitchenPrinters';
export { usePrintableReceipt } from '../hooks/usePrintableReceipt';
