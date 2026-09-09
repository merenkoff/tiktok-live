// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReceiptData } from '../lib/printer';
import { triggerPrint } from '../lib/triggerPrint';
import { ReceiptPrintable } from '../components/ReceiptPrintable';

// Fallback for stores without a configured ESC/POS printer: renders the
// receipt off-screen and opens the OS print dialog. macOS and Windows both
// ship a "save as PDF" option there (Windows via the built-in "Microsoft
// Print to PDF" printer); on Linux it depends on the desktop's print
// backend having one.
export function usePrintableReceipt() {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (!receipt) return;
    const clear = () => setReceipt(null);
    window.addEventListener('afterprint', clear);
    const raf = requestAnimationFrame(triggerPrint);
    return () => {
      window.removeEventListener('afterprint', clear);
      cancelAnimationFrame(raf);
    };
  }, [receipt]);

  const printToPdf = useCallback((data: ReceiptData) => setReceipt(data), []);

  const printablePortal =
    typeof document !== 'undefined'
      ? createPortal(<ReceiptPrintable receipt={receipt} />, document.body)
      : null;

  return { printToPdf, printablePortal };
}
