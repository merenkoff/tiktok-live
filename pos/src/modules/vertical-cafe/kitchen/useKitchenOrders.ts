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
import { applyPrep, clockOffset, REMOTE_DELAY_MIN, serverMessage } from './lib/kitchen';
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
  /** Take the ORDER, not an id: the board has sales and rounds on it. */
  markReady: (order: Pick<KitchenOrder, 'id' | 'kind'>) => Promise<void>;
  markServed: (order: Pick<KitchenOrder, 'id' | 'kind'>) => Promise<void>;
  /** «+10 хв» on a cafe's order: the promise moves there and here. */
  delayRemote: (order: Pick<KitchenOrder, 'id'>) => Promise<void>;
  /** Cafe orders whose «+10 хв» is on its way: a second tap would add ten more. */
  delaying: ReadonlySet<number>;
  clearBanner: () => void;
}

export function useKitchenOrders(enabled: boolean): KitchenOrders {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [delaying, setDelaying] = useState<ReadonlySet<number>>(() => new Set());
  const delayingRef = useRef(new Set<number>());
  // A read that started before a tap is dropped when it lands after it: it
  // would put back the card as it was before the tap for one more poll (the
  // red «Запізнюємось» right after «+10 хв», a «Готово» undone for five seconds).
  const writeSeqRef = useRef(0);
  /** Taps still on their way: a read landing meanwhile may predate what they wrote. */
  const writesRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const seq = writeSeqRef.current;
    try {
      const board = await kitchenApi.listOrders();
      if (!mountedRef.current || seq !== writeSeqRef.current || writesRef.current > 0) return;
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
    async (order: Pick<KitchenOrder, 'id' | 'kind'>, status: 'ready' | 'served') => {
      writeSeqRef.current += 1;
      writesRef.current += 1;
      setOrders((prev) => applyPrep(prev, order, status, new Date().toISOString()));
      try {
        await kitchenApi.setPrep(order, status);
        if (mountedRef.current) setBanner(null);
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося оновити замовлення'));
      } finally {
        writesRef.current -= 1;
        writeSeqRef.current += 1;
        await refresh();
      }
    },
    [refresh]
  );

  const markReady = useCallback(
    (order: Pick<KitchenOrder, 'id' | 'kind'>) => tap(order, 'ready'),
    [tap]
  );
  const markServed = useCallback(
    (order: Pick<KitchenOrder, 'id' | 'kind'>) => tap(order, 'served'),
    [tap]
  );
  const delayRemote = useCallback(
    async (order: Pick<KitchenOrder, 'id'>) => {
      // One «+10 хв» per tap: a double tap on a wet tablet must not tell the
      // cafe twenty. The button is off until the board has the moved promise.
      if (delayingRef.current.has(order.id)) return;
      delayingRef.current.add(order.id);
      setDelaying(new Set(delayingRef.current));
      writeSeqRef.current += 1;
      writesRef.current += 1;
      try {
        await kitchenApi.delayRemote(order.id, REMOTE_DELAY_MIN);
        if (mountedRef.current) setBanner(null);
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося перенести час'));
      } finally {
        writesRef.current -= 1;
        writeSeqRef.current += 1;
        await refresh();
        delayingRef.current.delete(order.id);
        if (mountedRef.current) setDelaying(new Set(delayingRef.current));
      }
    },
    [refresh]
  );
  const clearBanner = useCallback(() => setBanner(null), []);

  return { orders, offset, loading, error, banner, refresh, markReady, markServed, delayRemote, delaying, clearBanner };
}
