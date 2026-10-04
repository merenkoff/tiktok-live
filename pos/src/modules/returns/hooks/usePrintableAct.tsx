// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { triggerPrint } from '@pos/platform';
import { ActPrintable } from '../components/ActPrintable';
import type { ActData } from '../lib/actPayload';

/**
 * Prints the «Акт про видачу коштів» through the OS print dialog — the same
 * off-screen-then-`window.print()` arrangement `usePrintableReceipt` uses,
 * with the act in the portal instead of a receipt. There is no ESC/POS
 * version: an act is an A4 document signed by two people, and a 58 mm roll
 * is the wrong paper for it.
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

  const printAct = useCallback((data: ActData) => setAct(data), []);

  const actPortal =
    typeof document !== 'undefined' ? createPortal(<ActPrintable act={act} />, document.body) : null;

  return { printAct, actPortal };
}
