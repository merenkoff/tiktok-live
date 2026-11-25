// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafes' requests waiting for this kitchen's time (РК3), polled every
// three seconds — the cafe gives the kitchen a minute to answer, so five would
// eat a tenth of it.
//
// The strip is drawn over EVERY till screen of a store that has this module
// (`till.Banner`), so it first asks once whether this store is a kitchen at
// all, and polls only then: a cafe's till must not ask for a kitchen's
// requests all day. A store that is not a kitchen asks again every ten
// minutes, so a link the super admin made today starts without a restart.
// Only a visible tab polls, and a failed read changes nothing on screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as remoteApi from './remoteApi';
import type { RemoteRequest } from './remoteApi';
import { clockOffset, newIds, pendingRequests } from './lib';
import { serverMessage } from '../lib/hostPlatform';

export const REMOTE_POLL_MS = 3000;
export const NOT_KITCHEN_RECHECK_MS = 10 * 60_000;

export interface RemoteRequests {
  requests: RemoteRequest[];
  /** Server time minus device time, from the last read. */
  offset: number;
  /** A refused answer, in the server's words. */
  banner: string | null;
  /** Ids with an answer on its way, so a second tap does not send it twice. */
  busy: ReadonlySet<number>;
  answer: (order: RemoteRequest, minutes: number) => Promise<void>;
  decline: (order: RemoteRequest, reason: string) => Promise<void>;
  clearBanner: () => void;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useRemoteRequests(onNew?: () => void, api: typeof remoteApi = remoteApi): RemoteRequests {
  const [kitchen, setKitchen] = useState(false);
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [offset, setOffset] = useState(0);
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

  // Am I a kitchen? Once, then again every ten minutes while the answer is no.
  useEffect(() => {
    if (kitchen) return;
    let cancelled = false;
    const check = () => {
      api
        .isKitchen()
        .then((yes) => {
          if (!cancelled && yes) setKitchen(true);
        })
        .catch(() => undefined);
    };
    check();
    const id = setInterval(check, NOT_KITCHEN_RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kitchen, api]);

  const refresh = useCallback(async () => {
    try {
      const read = await api.listKitchenSide();
      if (!mountedRef.current) return;
      const pending = pendingRequests(read.orders);
      // The first read is what was already there when the screen opened: no chime.
      if (seenRef.current && newIds(seenRef.current, pending).length > 0) onNewRef.current?.();
      seenRef.current = new Set(pending.map((o) => o.id));
      setOffset(clockOffset(read.now));
      setRequests(pending);
    } catch {
      // A blip, or a server without the remote kitchen: the strip stays as it was.
    }
  }, [api]);

  useEffect(() => {
    if (!kitchen) return;
    void refresh();
    const id = setInterval(() => {
      if (visible()) void refresh();
    }, REMOTE_POLL_MS);
    return () => clearInterval(id);
  }, [kitchen, refresh]);

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
    offset,
    banner,
    busy,
    answer: (order, minutes) => send(order, () => api.answerWithTime(order, minutes)),
    decline: (order, reason) => send(order, () => api.decline(order, reason)),
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
    // No audio on this device, or not before a first tap: the strip still shows.
  }
}
