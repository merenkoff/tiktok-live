// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printSlip,
  triggerPrint,
  useAuthStore,
  usePosShell,
} from '@pos/platform';
import type { ReceiptPaperWidth } from '@pos/platform';
import { ActPrintable } from '../components/ActPrintable';
import { actSlip, type ActData } from '../lib/actPayload';

/**
 * Prints the «Акт про видачу коштів». By default through the OS print dialog
 * on A4 — the same off-screen-then-`window.print()` arrangement
 * `usePrintableReceipt` uses, with the act in the portal: it is signed by two
 * people and kept with the till's documents.
 *
 * Where the owner switched «Акт повернення — на принтері чеків» on
 * (`store.refund_act_on_receipt_printer`, migration 114) and this is the
 * desktop with a receipt printer chosen, it goes to that printer as a slip
 * (`actSlip`) instead — a shop with no office printer prints its acts on the
 * roll. A failed slip falls back to the A4 dialog rather than leave the
 * cashier with no act at all.
 */
export function usePrintableAct() {
  const [act, setAct] = useState<ActData | null>(null);

  useEffect(() => {
    if (!act) return;
    const clear = () => setAct(null);
    window.addEventListener('afterprint', clear);
    const raf = requestAnimationFrame(triggerPrint);
    return () => {
      window.removeEventListener('afterprint', clear);
      cancelAnimationFrame(raf);
    };
  }, [act]);

  const onRoll = useAuthStore((s) => s.auth?.store.refund_act_on_receipt_printer === true);
  const desktop = usePosShell() === 'cashier';

  const printAct = useCallback(
    (data: ActData) => {
      if (!onRoll || !desktop) {
        setAct(data);
        return;
      }
      void (async () => {
        try {
          const [name, mm] = await Promise.all([
            getMeta<string>('receiptPrinterName'),
            getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
          ]);
          if (!name) {
            setAct(data);
            return;
          }
          await printSlip(name, actSlip(data), mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH);
        } catch {
          setAct(data);
        }
      })();
    },
    [onRoll, desktop]
  );

  const actPortal =
    typeof document !== 'undefined' ? createPortal(<ActPrintable act={act} />, document.body) : null;

  return { printAct, actPortal };
}
