// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import { triggerPrint } from '@pos/platform';
import { TechCardPrintable } from '../components/TechCardPrintable';
import type { TechCardSheet } from './techCardSheet';

/**
 * Prints a tech card through the OS print dialog — the off-screen-then-print
 * arrangement the receipt and the refund act use. `triggerPrint`, not
 * `window.print()`: inside the desktop till's webview the latter does
 * nothing at all.
 */
export function useTechCardPrint(): { print: (sheet: TechCardSheet) => void; portal: ReactPortal | null } {
  const [sheet, setSheet] = useState<TechCardSheet | null>(null);

  useEffect(() => {
    if (!sheet) return;
    const clear = () => setSheet(null);
    window.addEventListener('afterprint', clear);
    const raf = requestAnimationFrame(triggerPrint);
    return () => {
      window.removeEventListener('afterprint', clear);
      cancelAnimationFrame(raf);
    };
  }, [sheet]);

  const print = useCallback((next: TechCardSheet) => setSheet(next), []);
  const portal =
    typeof document !== 'undefined' ? createPortal(<TechCardPrintable sheet={sheet} />, document.body) : null;
  return { print, portal };
}
