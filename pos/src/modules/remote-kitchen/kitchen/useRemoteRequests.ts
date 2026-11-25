// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's requests waiting for this kitchen's time (РК3), polled every
// three seconds — the cafe gives the kitchen a minute to answer, so five
// would eat a tenth of it. Same plain interval as `useKitchenOrders`.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as remoteApi from './remoteApi';
import type { RemoteRequest } from './remoteApi';
import { newIds, pendingRequests } from './lib/remote';
import { serverMessage } from './lib/kitchen';

export const REMOTE_POLL_MS = 3000;

export interface RemoteRequests {
  requests: RemoteRequest[];
  /** A refused answer, in the server's words. */
  banner: string | null;
  /** Ids with an answer on its way, so a second tap does not send it twice. */
  busy: ReadonlySet<number>;
  answer: (order: RemoteRequest, minutes: number) => Promise<void>;
  decline: (order: RemoteRequest, reason: string) => Promise<void>;
  clearBanner: () => void;
}

export function useRemoteRequests(enabled: boolean, onNew?: () => void): RemoteRequests {
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const seenRef = useRef<Set<number> | null>(null);
  const mountedRef = useRef(true);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const pending = pendingRequests(await remoteApi.listKitchenSide());
      if (!mountedRef.current) return;
      // The first read is what was already there when the screen opened: no chime.
      if (seenRef.current && newIds(seenRef.current, pending).length > 0) onNewRef.current?.();
      seenRef.current = new Set(pending.map((o) => o.id));
      setRequests(pending);
    } catch {
      // A host or server without the module, or a blip: the panel just stays
      // as it was. The board above it says when the network is gone.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refresh();
    }, REMOTE_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const send = useCallback(
    async (order: RemoteRequest, call: () => Promise<unknown>) => {
      setBusy((prev) => new Set(prev).add(order.id));
      try {
        await call();
        if (mountedRef.current) setRequests((prev) => prev.filter((o) => o.id !== order.id));
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося відповісти — спробуйте ще раз'));
      } finally {
        if (mountedRef.current) {
          setBusy((prev) => {
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
          void refresh();
        }
      }
    },
    [refresh]
  );

  return {
    requests,
    banner,
    busy,
    answer: (order, minutes) => send(order, () => remoteApi.answerWithTime(order, minutes)),
    decline: (order, reason) => send(order, () => remoteApi.decline(order, reason)),
    clearBanner: () => setBanner(null),
  };
}

/** One short tone for a new request; silently nothing where audio is not allowed. */
export function chime(): void {
  try {
    const Ctx =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // No audio on this device, or not before a first tap: the panel still shows.
  }
}
