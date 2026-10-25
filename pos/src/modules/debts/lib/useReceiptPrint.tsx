// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Printing the repayment receipt — the host's own receipt, the one a sale
// prints (`buildReceiptPayload` + `printReceipt`), because a repayment IS a
// sale: the same lines, the same fiscal block, the same paper. The till's
// receipt printer when one is set, the browser's print dialog otherwise.
//
// One thing the host's layout cannot know: a line that closes goods money was
// taken toward earlier as «внески» (078) prints its unit price over a smaller
// sum — «1 x 590.00 … 290.00». The line says why under it.

import { useCallback, useState } from 'react';
import {
  buildReceiptPayload,
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printReceipt,
  useAuthStore,
  usePrintableReceipt,
} from '@pos/platform';
import type { ReceiptData, ReceiptPaperWidth, SaleDetail } from '@pos/platform';
import type { DebtSale } from './types';

/** «Внесено раніше: 300.00» under each line the earlier «внески» went to, in the receipt's own number style. */
export function withPrepaidNotes(receipt: ReceiptData, sale: SaleDetail): ReceiptData {
  const items = (sale as DebtSale).items;
  if (!items.some((item) => (item.debt_prepaid_cents ?? 0) > 0)) return receipt;
  return {
    ...receipt,
    items: receipt.items.map((row, index) => {
      const prepaid = items[index]?.debt_prepaid_cents ?? 0;
      if (prepaid <= 0) return row;
      const said = `Внесено раніше: ${(prepaid / 100).toFixed(2)}`;
      return { ...row, note: row.note ? `${row.note} · ${said}` : said };
    }),
  };
}

export function useReceiptPrint() {
  const auth = useAuthStore((s) => s.auth);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const print = useCallback(
    async (sale: SaleDetail) => {
      const receipt = withPrepaidNotes(
        buildReceiptPayload(sale, {
          name: auth?.store.name ?? '',
          fiscal: auth?.store.fiscal ?? null,
          vertical: auth?.store.vertical?.id ?? null,
        }),
        sale
      );
      const [name, mm] = await Promise.all([
        getMeta<string>('receiptPrinterName'),
        getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
      ]);
      if (!name) {
        printToPdf(receipt);
        return;
      }
      setPrinting(true);
      setStatus(null);
      try {
        await printReceipt(name, receipt, mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH);
        setStatus('Чек надіслано на друк');
      } catch (e) {
        setStatus(`Не вдалося надрукувати: ${typeof e === 'string' ? e : String(e)}`);
      } finally {
        setPrinting(false);
      }
    },
    [auth, printToPdf]
  );

  return { print, printing, status, printablePortal };
}
