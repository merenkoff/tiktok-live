import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import type { ReceiptData } from '../lib/printer';
import { ReceiptPrintable } from '../components/ReceiptPrintable';

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

function triggerPrint() {
  if (isMac) {
    // WKWebView's window.print() silently no-ops on macOS (no native print
    // delegate wired up) — the `print_webview` Tauri command drives the
    // same print pipeline via AppKit instead. Fall back to window.print()
    // if the command isn't available for some reason.
    void invoke('print_webview').catch(() => window.print());
    return;
  }
  window.print();
}

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
