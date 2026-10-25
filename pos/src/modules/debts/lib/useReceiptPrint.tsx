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
//
// Under ПРРО a «внесок» is a receipt too — a «чек передплати» of the line's
// chain (§11 «Крок 2») — and prints the provider's own text. When that text
// did not arrive, our layout would print a receipt with no goods at all; it
// gets one line instead, «Передплата за «Кепка»», with the chain's number.

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

/** A «внесок» printed by our layout: one line for the money, naming the goods it is toward and the chain. */
export function withPrepaymentLine(receipt: ReceiptData, sale: SaleDetail): ReceiptData {
  const debt = sale as DebtSale;
  const line = debt.debt_prepayment;
  if (!line || receipt.provider_text || receipt.items.length > 0) return receipt;
  const title = line.variant_label ? `${line.product_name} · ${line.variant_label}` : line.product_name;
  return {
    ...receipt,
    items: [
      {
        name: `Передплата за «${title}»`,
        variant_label: '',
        quantity: 1,
        unit_price_cents: sale.total_cents,
        line_total_cents: sale.total_cents,
        ...(debt.fiscal_chain_id ? { note: `Замовлення № ${debt.fiscal_chain_id}` } : {}),
      },
    ],
  };
}

export function useReceiptPrint() {
  const auth = useAuthStore((s) => s.auth);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const print = useCallback(
    async (sale: SaleDetail) => {
      const receipt = withPrepaymentLine(
        withPrepaidNotes(
          buildReceiptPayload(sale, {
            name: auth?.store.name ?? '',
            fiscal: auth?.store.fiscal ?? null,
            vertical: auth?.store.vertical?.id ?? null,
          }),
          sale
        ),
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

  /**
   * Several receipts of one repayment, in order. The browser's print dialog
   * shows one document at a time, so without a receipt printer only the first
   * goes out by itself and the rest wait for their buttons.
   */
  const printMany = useCallback(
    async (sales: SaleDetail[]) => {
      if (sales.length === 0) return;
      const name = await getMeta<string>('receiptPrinterName');
      if (!name) {
        await print(sales[0]);
        return;
      }
      for (const sale of sales) await print(sale);
    },
    [print]
  );

  return { print, printMany, printing, status, printablePortal };
}
