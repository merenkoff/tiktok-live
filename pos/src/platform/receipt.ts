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
} from '../lib/printer';
export { usePrintableReceipt } from '../hooks/usePrintableReceipt';
