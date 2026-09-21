// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen board's data: today's open orders, polled every five seconds
// (café phase К3c). Same "plain interval, no react-query" reasoning as
// `fiscal-core/hooks/useFiscalStatus.ts` — this bundle shares only
// `@pos/platform` with the host, and one interval is not worth a data layer.
//
// Two taps and no clock (TechDocs/POS_CAFE.md §10): «Готово» and «Видано» are
// sent as they are tapped and applied to the list optimistically, then the
// list is re-read — the server is the truth, the optimistic move only keeps
// the tap from feeling ignored. A 409 is the other screen having been faster;
// it is shown in the server's words and the re-read settles it.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as kitchenApi from './kitchenApi';
import { applyPrep, clockOffset, serverMessage } from './lib/kitchen';
import type { KitchenOrder } from './types';

export const POLL_MS = 5000;

export interface KitchenOrders {
  orders: KitchenOrder[];
  /** Server clock minus tablet clock, ms — every wait is computed with it. */
  offset: number;
  loading: boolean;
  /** The list could not be read at all (network, host too old). */
  error: string | null;
  /** A tap the server refused, in its words. */
  banner: string | null;
  refresh: () => Promise<void>;
  markReady: (saleId: number) => Promise<void>;
  markServed: (saleId: number) => Promise<void>;
  clearBanner: () => void;
}

export function useKitchenOrders(enabled: boolean): KitchenOrders {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const board = await kitchenApi.listOrders();
      if (!mountedRef.current) return;
      setOrders(board.orders);
      setOffset(clockOffset(board.now));
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(serverMessage(err, 'Не вдалося прочитати замовлення'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => {
      // A tablet whose tab is in the background is not looking; polling it
      // only burns the battery and the server. Spelled as «not visible» on
      // purpose: this file is Tailwind content for the module's own sheet, and
      // the other state's name (the boolean property too — Tailwind splits on
      // the dot) is also a display utility (see `injectModuleStyle`).
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const tap = useCallback(
    async (saleId: number, status: 'ready' | 'served') => {
      setOrders((prev) => applyPrep(prev, saleId, status, new Date().toISOString()));
      try {
        await kitchenApi.setPrep(saleId, status);
        if (mountedRef.current) setBanner(null);
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося оновити замовлення'));
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const markReady = useCallback((saleId: number) => tap(saleId, 'ready'), [tap]);
  const markServed = useCallback((saleId: number) => tap(saleId, 'served'), [tap]);
  const clearBanner = useCallback(() => setBanner(null), []);

  return { orders, offset, loading, error, banner, refresh, markReady, markServed, clearBanner };
}
