// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export { buildReceiptPayload, buildRefundReceiptPayload } from '../lib/receipt';
export {
  listPrinters,
  printReceipt,
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
} from '../lib/printer';
export { usePrintableReceipt } from '../hooks/usePrintableReceipt';
