// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's paid kitchen orders (РК5), polled every ten seconds — the same
// pace as a time the guest is thinking over (§8): a stage that moves a few
// seconds late costs nothing, and the kitchen's cancel is a red line the
// cashier answers, not a sound.
//
// Like the kitchen's strip it hangs over every till screen, so it first asks
// once whether this store is a cafe of some kitchen at all and polls only
// then; a store that is not asks again every ten minutes. Only a visible tab
// polls, and a failed read changes nothing on screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as trackerApi from './trackerApi';
import type { TrackedOrder } from './trackerApi';
import { trackedOrders } from './lib';
import { serverMessage } from '../lib/hostPlatform';

export const CAFE_POLL_MS = 10_000;
export const NOT_CAFE_RECHECK_MS = 10 * 60_000;

export type TrackerAction = 'arrived' | 'handed' | 'cancel-seen';

export interface CafeOrders {
  orders: TrackedOrder[];
  /** Server time minus device time, from the last read. */
  offset: number;
  /** A refused tap, in the server's words. */
  banner: string | null;
  busy: ReadonlySet<number>;
  act: (order: TrackedOrder, action: TrackerAction) => Promise<void>;
  clearBanner: () => void;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

const CALLS: Record<TrackerAction, (api: typeof trackerApi, id: number) => Promise<TrackedOrder>> = {
  arrived: (api, id) => api.markArrived(id),
  handed: (api, id) => api.markHanded(id),
  'cancel-seen': (api, id) => api.markCancelSeen(id),
};

export function useCafeOrders(api: typeof trackerApi = trackerApi): CafeOrders {
  const [cafe, setCafe] = useState(false);
  const [all, setAll] = useState<TrackedOrder[]>([]);
  const [offset, setOffset] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Am I a cafe? Once, then again every ten minutes while the answer is no.
  useEffect(() => {
    if (cafe) return;
    let cancelled = false;
    const check = () => {
      api
        .isCafe()
        .then((yes) => {
          if (!cancelled && yes) setCafe(true);
        })
        .catch(() => undefined);
    };
    check();
    const id = setInterval(check, NOT_CAFE_RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [cafe, api]);

  const refresh = useCallback(async () => {
    try {
      const read = await api.listCafeSide();
      if (!mountedRef.current) return;
      const server = read.now ? Date.parse(read.now) : NaN;
      setOffset(Number.isNaN(server) ? 0 : server - Date.now());
      setAll(read.orders);
    } catch {
      // A blip, or a cashier the owner kept off the section: the tracker stays as it was.
    }
  }, [api]);

  useEffect(() => {
    if (!cafe) return;
    void refresh();
    const id = setInterval(() => {
      if (visible()) void refresh();
    }, CAFE_POLL_MS);
    return () => clearInterval(id);
  }, [cafe, refresh]);

  const act = useCallback(
    async (order: TrackedOrder, action: TrackerAction) => {
      setBusy((prev) => new Set(prev).add(order.id));
      try {
        const next = await CALLS[action](api, order.id);
        if (mountedRef.current && next && typeof next === 'object') {
          setAll((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...next } : o)));
        }
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося зберегти — спробуйте ще раз'));
      } finally {
        if (mountedRef.current) {
          setBusy((prev) => {
            const rest = new Set(prev);
            rest.delete(order.id);
            return rest;
          });
          void refresh();
        }
      }
    },
    [api, refresh]
  );

  return {
    orders: trackedOrders(all),
    offset,
    banner,
    busy,
    act,
    clearBanner: () => setBanner(null),
  };
}
