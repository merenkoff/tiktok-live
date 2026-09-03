// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import type { SaleDetail } from '@pos/platform';
import { saleRowFromDetail } from '../data/returnsApi';

const RefundSaleDialog = lazy(() =>
  import('../components/RefundSaleDialog').then((m) => ({ default: m.RefundSaleDialog }))
);

export interface CancelRungSale {
  /** Open the "cancel this receipt" dialog for a just-completed sale. */
  open: (sale: SaleDetail) => void;
  /** Drop into the tree wherever the dialog should render. */
  node: ReactNode;
  /** Final status once a refund/void landed (`refunded` | `voided` | `partially_refunded`), else null. */
  result: string | null;
  /** Freshest `SaleDetail` after a partial refund — the caller re-renders the receipt from it. */
  detail: SaleDetail | null;
  /** Forget the last cancellation (e.g. when starting a new sale). */
  reset: () => void;
}

/**
 * Device-local self-service: a cashier must be able to undo a receipt they just
 * rang up even when the store has not enabled the `returns` back-office. The
 * heavy receipts pages stay gated; only this small dialog is always reachable,
 * and it is lazy-loaded so it costs nothing until used.
 */
export function useCancelRungSale(): CancelRungSale {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);

  const open = useCallback((s: SaleDetail) => setSale(s), []);
  const reset = useCallback(() => {
    setSale(null);
    setResult(null);
    setDetail(null);
  }, []);

  const node = sale ? (
    <Suspense fallback={null}>
      <RefundSaleDialog
        sale={saleRowFromDetail(sale)}
        detail={sale}
        selectAll
        onClose={() => setSale(null)}
        onRefunded={(row) => {
          setSale(null);
          setResult(row.status);
          if (row.detail) setDetail(row.detail);
        }}
      />
    </Suspense>
  ) : null;

  return { open, node, result, detail, reset };
}
