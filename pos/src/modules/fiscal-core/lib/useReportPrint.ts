// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paper for an X- or Z-report. The law does not ask for it — a ПРРО Z-report
// is an electronic document kept by the provider — but a shop puts the X-report
// beside the cash it hands over and files the day's Z-report, so the till
// prints what the provider rendered, line for line.
//
// No new host command: the report goes through the host's receipt path as a
// provider text (`provider_text`, printed verbatim by `print_receipt` and by
// `ReceiptPrintable`), to the till's receipt printer when it has one and to the
// browser's print dialog when it has none — the same choice the debts module's
// receipts make.

import { useCallback, useState } from 'react';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printReceipt,
  usePrintableReceipt,
  type ReceiptData,
  type ReceiptPaperWidth,
} from '@pos/platform';

/** A report as a receipt whose provider text is the whole document. */
export function reportReceipt(text: string, now: Date = new Date()): ReceiptData {
  return {
    store_name: '',
    kind: 'sale',
    receipt_number: '',
    refund_of_receipt: null,
    created_at: now.toISOString(),
    staff_name: '',
    customer_name: null,
    items: [],
    subtotal_cents: 0,
    discount_cents: null,
    total_cents: 0,
    payments: [],
    provider_text: text,
  };
}

export interface ReportPrint {
  print: (text: string) => Promise<void>;
  printing: boolean;
  /** What happened to the last print, in the cashier's words; null before one. */
  status: string | null;
  /** The browser-print target; render it once anywhere on the page. */
  portal: ReturnType<typeof usePrintableReceipt>['printablePortal'];
}

export function useReportPrint(): ReportPrint {
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const print = useCallback(
    async (text: string) => {
      const receipt = reportReceipt(text);
      const [name, mm] = await Promise.all([
        getMeta<string>('receiptPrinterName').catch(() => undefined),
        getMeta<ReceiptPaperWidth>('receiptPaperWidthMm').catch(() => undefined),
      ]);
      if (!name) {
        setStatus(null);
        printToPdf(receipt);
        return;
      }
      setPrinting(true);
      setStatus(null);
      try {
        await printReceipt(name, receipt, mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH);
        setStatus('Звіт надіслано на друк');
      } catch (e) {
        setStatus(`Не вдалося надрукувати: ${typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)}`);
      } finally {
        setPrinting(false);
      }
    },
    [printToPdf]
  );

  return { print, printing, status, portal: printablePortal };
}
