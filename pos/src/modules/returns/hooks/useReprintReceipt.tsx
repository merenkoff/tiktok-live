// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Друкувати чек» in «Чеки» (the owner's word of 2026-11-23): a customer who
// comes back for the paper gets it — marked «КОПІЯ ЧЕКА». Never for a receipt
// with a return (its goods are no longer what the paper would list, and the
// return has its own «Видатковий чек»), a voided one or a «внесок»; the server
// refuses those too.
//
// Where it prints depends on the device. The desktop prints on its own receipt
// printer (or the OS dialog when it has none); a phone or a tablet has no
// printer, so it asks the computer of the till through the server's queue
// (`POST /sales/:id/print-request`, TechDocs/POS_PHONE_TILL.md Т2) and says
// what came of it; with no computer at all it opens the browser's print
// dialog (AirPrint on an iPhone) rather than say nothing.

import { useCallback, useState } from 'react';
import {
  api,
  buildReceiptPayload,
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printReceipt,
  useAuthStore,
  usePosShell,
  usePrintableReceipt,
} from '@pos/platform';
import type { LocalSaleRow, ReceiptData, ReceiptPaperWidth, SaleDetail } from '@pos/platform';

/** Whether a receipt may be printed again — the server's rule, mirrored. */
export function canReprint(row: LocalSaleRow, detail: SaleDetail | null): boolean {
  if (row.status !== 'completed') return false;
  if (row.debt_prepayment || detail?.debt_prepayment) return false;
  if (row.sync_state) return false;
  if ((row.refunded_cents ?? 0) > 0) return false;
  return !(detail?.refunds?.length ?? 0);
}

interface PrintAnswer {
  till?: 'none' | 'online' | 'offline';
}

function refusalOf(error: unknown): string | null {
  const data = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response;
  return data?.status === 409 && typeof data.data?.error === 'string' ? data.data.error : null;
}

export function useReprintReceipt() {
  const auth = useAuthStore((s) => s.auth);
  const desktop = usePosShell() === 'cashier';
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reprint = useCallback(
    async (row: LocalSaleRow, detail: SaleDetail) => {
      setBusy(true);
      setMessage(null);
      const store = {
        name: auth?.store.name ?? '',
        fiscal: auth?.store.fiscal ?? null,
        vertical: auth?.store.vertical?.id ?? null,
        feedback_url: auth?.store.feedback_url ?? null,
      };
      const copy: ReceiptData = { ...buildReceiptPayload(detail, store), copy: true };
      try {
        if (desktop) {
          const [name, mm] = await Promise.all([
            getMeta<string>('receiptPrinterName'),
            getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
          ]);
          if (!name) {
            printToPdf(copy);
            return;
          }
          await printReceipt(name, copy, mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH);
          setMessage('Копію чека надіслано на друк');
          return;
        }
        const id = row.server_id ?? detail.id;
        let answer: PrintAnswer;
        try {
          answer = await api.posRequest<PrintAnswer>('post', `/sales/${id}/print-request`, { copy: true });
        } catch (error) {
          const refusal = refusalOf(error);
          if (refusal) {
            setMessage(refusal);
            return;
          }
          // An older server, or no network: the browser's own dialog still works.
          printToPdf(copy);
          return;
        }
        if (answer.till === 'online') setMessage('Чек друкується на касі');
        else if (answer.till === 'offline')
          setMessage('Комп’ютер каси вимкнений — чек надрукується, якщо його увімкнуть протягом 10 хвилин');
        else printToPdf(copy);
      } catch (error) {
        setMessage(`Не вдалося надрукувати: ${typeof error === 'string' ? error : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [auth, desktop, printToPdf]
  );

  const clear = useCallback(() => setMessage(null), []);

  return { reprint, busy, message, clear, printablePortal };
}
