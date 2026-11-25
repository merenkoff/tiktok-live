// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen's paid orders on «Прийом запитів» (РК5), read every ten
// seconds while the tab is visible. A failed read changes nothing on screen,
// and a read that started before a tap is dropped (`lib/writeGuard.ts`).

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ordersApi from './ordersApi';
import type { KitchenOrder } from './ordersApi';
import { ordersInWork } from './ordersLib';
import { serverMessage } from '../lib/hostPlatform';
import { useWriteGuard } from '../lib/writeGuard';

export const KITCHEN_ORDERS_POLL_MS = 10_000;

export type KitchenOrderAction = { kind: 'delay'; minutes: number } | { kind: 'cancel'; reason: string };

export interface KitchenOrders {
  orders: KitchenOrder[];
  /** Server time minus device time, from the last read. */
  offset: number;
  loaded: boolean;
  note: { ok: boolean; text: string } | null;
  busy: ReadonlySet<number>;
  act: (order: KitchenOrder, action: KitchenOrderAction) => Promise<boolean>;
  clearNote: () => void;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useKitchenOrders(api: typeof ordersApi = ordersApi): KitchenOrders {
  const [all, setAll] = useState<KitchenOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const mountedRef = useRef(true);
  const guard = useWriteGuard();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const stamp = guard.stamp();
    try {
      const read = await api.listKitchenOrders();
      if (!mountedRef.current || !guard.fresh(stamp)) return;
      const server = read.now ? Date.parse(read.now) : NaN;
      setOffset(Number.isNaN(server) ? 0 : server - Date.now());
      setAll(read.orders);
      setLoaded(true);
    } catch {
      // A blip: the list stays as it was.
    }
  }, [api, guard]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (visible()) void refresh();
    }, KITCHEN_ORDERS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const act = useCallback(
    async (order: KitchenOrder, action: KitchenOrderAction): Promise<boolean> => {
      setBusy((prev) => new Set(prev).add(order.id));
      setNote(null);
      guard.begin();
      try {
        const next =
          action.kind === 'delay'
            ? await api.delayOrder(order.id, action.minutes)
            : await api.cancelOrder(order.id, action.reason);
        if (mountedRef.current && next && typeof next === 'object') {
          setAll((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...next } : o)));
          setNote({
            ok: true,
            text:
              action.kind === 'delay'
                ? `Додали ${action.minutes} хв — кафе бачить новий час`
                : 'Скасовано — кафе бачить це червоним і поверне гостю гроші',
          });
        }
        return true;
      } catch (err) {
        if (mountedRef.current) setNote({ ok: false, text: serverMessage(err, 'Не вдалося зберегти — спробуйте ще раз') });
        return false;
      } finally {
        guard.end();
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
    [api, guard, refresh]
  );

  return {
    orders: ordersInWork(all),
    offset,
    loaded,
    note,
    busy,
    act,
    clearNote: () => setNote(null),
  };
}
