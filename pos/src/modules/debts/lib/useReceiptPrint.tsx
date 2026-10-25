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
// Its return when the chain is given back (2-Б) is printed the same way: the
// host's return receipt, «ВИДАТКОВИЙ ЧЕК», with that one line.

import { useCallback, useState } from 'react';
import {
  buildReceiptPayload,
  buildRefundReceiptPayload,
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printReceipt,
  useAuthStore,
  usePrintableReceipt,
} from '@pos/platform';
import type { ReceiptData, ReceiptPaperWidth, SaleDetail, SaleFiscalDoc } from '@pos/platform';
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

/** What the host's layout knows of the store — its own type stays inside the host. */
type StoreInfo = Parameters<typeof buildReceiptPayload>[1];

/** A return document as this call or `GET /sales/:id` gives it — the one shape the host's layout reads. */
type ReturnFiscal = {
  status: string;
  mode?: SaleFiscalDoc['mode'];
  fiscal_code: string | null;
  fiscal_date: string | null;
  control_number?: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  message?: string | null;
  error_message?: string | null;
};

/**
 * The return receipt of one refund of a sale — a chain given back (2-Б):
 * the goods that came back, or, for a «внесок», the one line for its money.
 * `fiscal` is the return document of this call, else the refund's own.
 */
export function chainRefundReceipt(
  sale: SaleDetail,
  refundId: number,
  store: StoreInfo,
  fiscal?: ReturnFiscal | null
): ReceiptData | null {
  const refund = sale.refunds.find((r) => r.id === refundId);
  if (!refund) return null;
  const doc: ReturnFiscal | null = fiscal ?? refund.fiscal ?? null;
  const receipt = buildRefundReceiptPayload(
    sale,
    refund,
    (refund.items ?? []).map((item) => ({ sale_item_id: item.sale_item_id, quantity: item.quantity })),
    store,
    doc
      ? {
          status: doc.status === 'done' || doc.status === 'pending' ? doc.status : 'failed',
          mode: doc.mode,
          fiscal_code: doc.fiscal_code,
          fiscal_date: doc.fiscal_date,
          control_number: doc.control_number ?? null,
          tax_url: doc.tax_url,
          qr_payload: doc.qr_payload,
          receipt_text: doc.receipt_text,
          error_code: doc.error_code,
          message: doc.message ?? doc.error_message ?? null,
        }
      : null
  );
  return withPrepaymentLine({ ...receipt, total_cents: refund.total_cents }, { ...sale, total_cents: refund.total_cents });
}

export function useReceiptPrint() {
  const auth = useAuthStore((s) => s.auth);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const store = useCallback(
    (): StoreInfo => ({
      name: auth?.store.name ?? '',
      fiscal: auth?.store.fiscal ?? null,
      vertical: auth?.store.vertical?.id ?? null,
    }),
    [auth]
  );

  /** One receipt to the till's receipt printer, or to the browser's print dialog without one. */
  const send = useCallback(
    async (receipt: ReceiptData) => {
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
    [printToPdf]
  );

  const print = useCallback(
    (sale: SaleDetail) =>
      send(withPrepaymentLine(withPrepaidNotes(buildReceiptPayload(sale, store()), sale), sale)),
    [send, store]
  );

  /**
   * Several receipts in order. The browser's print dialog shows one document
   * at a time, so without a receipt printer only the first goes out by itself
   * and the rest wait for their buttons.
   */
  const sendAll = useCallback(
    async (receipts: ReceiptData[]) => {
      if (receipts.length === 0) return;
      const name = await getMeta<string>('receiptPrinterName');
      for (const receipt of name ? receipts : receipts.slice(0, 1)) await send(receipt);
    },
    [send]
  );

  /** The receipts of one repayment. */
  const printMany = useCallback(
    (sales: SaleDetail[]) =>
      sendAll(sales.map((sale) => withPrepaymentLine(withPrepaidNotes(buildReceiptPayload(sale, store()), sale), sale))),
    [sendAll, store]
  );

  /** The return receipts of a chain given back (2-Б), in order. */
  const printRefunds = useCallback(
    (refunds: Array<{ sale: SaleDetail; refundId: number; fiscal?: ReturnFiscal | null }>) =>
      sendAll(
        refunds
          .map(({ sale, refundId, fiscal }) => chainRefundReceipt(sale, refundId, store(), fiscal))
          .filter((receipt): receipt is ReceiptData => receipt != null)
      ),
    [sendAll, store]
  );

  return { print, printMany, printRefunds, printing, status, printablePortal };
}
