// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafes' requests waiting for this kitchen's time (РК3). Long-polled (РК4,
// §8): each read hands back a cursor and the next one waits on the server
// until a cafe asks, changes or pays, so a request shows in well under a
// second and an idle kitchen asks about five times a minute. A server without
// the long-poll sends no cursor, and the strip polls every three seconds as
// before — the cafe gives the kitchen a minute to answer, so five would eat a
// tenth of it.
//
// The strip is drawn over EVERY till screen of a store that has this module
// (`till.Banner`), so it first asks once whether this store is a kitchen at
// all, and polls only then: a cafe's till must not ask for a kitchen's
// requests all day. A store that is not a kitchen asks again every ten
// minutes, so a link the super admin made today starts without a restart.
// Only a visible tab polls, and a failed read changes nothing on screen. A
// read that started before an answer is dropped (`lib/writeGuard.ts`): it
// would bring the answered request back for a poll and invite a second tap.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as remoteApi from './remoteApi';
import type { RemoteRequest } from './remoteApi';
import { autoConfirmed, clockOffset, newIds, pendingRequests } from './lib';
import { serverMessage } from '../lib/hostPlatform';
import { useWriteGuard } from '../lib/writeGuard';

export const REMOTE_POLL_MS = 3000;
export const NOT_KITCHEN_RECHECK_MS = 10 * 60_000;

export interface RemoteRequests {
  requests: RemoteRequest[];
  /** Times the server confirmed by itself that the cook may still change (grey cards, no chime). */
  confirmed: RemoteRequest[];
  /** Server time minus device time, from the last read. */
  offset: number;
  /** A refused answer, in the server's words. */
  banner: string | null;
  /** Ids with an answer on its way, so a second tap does not send it twice. */
  busy: ReadonlySet<number>;
  answer: (order: RemoteRequest, minutes: number) => Promise<void>;
  decline: (order: RemoteRequest, reason: string) => Promise<void>;
  /** «Немає» by dish: the lines go back to the cafe marked. */
  declineDishes: (order: RemoteRequest, itemIds: number[]) => Promise<void>;
  clearBanner: () => void;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useRemoteRequests(onNew?: () => void, api: typeof remoteApi = remoteApi): RemoteRequests {
  const [kitchen, setKitchen] = useState(false);
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [confirmed, setConfirmed] = useState<RemoteRequest[]>([]);
  const [offset, setOffset] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const seenRef = useRef<Set<number> | null>(null);
  const mountedRef = useRef(true);
  const guard = useWriteGuard();
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

  const refresh = useCallback(async (since?: string): Promise<string | undefined> => {
    const stamp = guard.stamp();
    try {
      const read = await api.listKitchenSide(since);
      if (!mountedRef.current) return undefined;
      // A read that began before a tap (or while one was on its way) says what
      // was true before it: drop what it says — and its cursor too, which
      // already counts whatever woke it (a new request, say). Handing back the
      // cursor this read was SENT with makes the next one answer at once with
      // the state as it is now; keeping the new one would hold it on the
      // server for the full wait while that request sits unseen and unrung.
      if (!guard.fresh(stamp)) return since;
      const pending = pendingRequests(read.orders);
      // The first read is what was already there when the screen opened: no chime.
      if (seenRef.current && newIds(seenRef.current, pending).length > 0) onNewRef.current?.();
      seenRef.current = new Set(pending.map((o) => o.id));
      const offsetNow = clockOffset(read.now);
      setOffset(offsetNow);
      setRequests(pending);
      setConfirmed(autoConfirmed(read.orders, offsetNow));
      return read.cursor;
    } catch {
      // A blip, or a server without the remote kitchen: the strip stays as it was.
      return undefined;
    }
  }, [api, guard]);

  useEffect(() => {
    if (!kitchen) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
    void (async () => {
      let cursor: string | undefined;
      while (!stopped) {
        // A tablet whose tab is hidden is not looking: no read, and the next
        // one starts fresh, without a cursor.
        if (!visible()) {
          cursor = undefined;
          await pause(REMOTE_POLL_MS);
          continue;
        }
        const started = Date.now();
        const sent = cursor;
        cursor = await refresh(sent);
        if (stopped) break;
        // No cursor (an older server, a failed read) is the plain poll. The
        // same cursor straight back is a server, or a proxy, that would not
        // hold the read: poll too, rather than ask in a tight loop. A read
        // dropped for a tap hands back the cursor it was sent with: after a
        // held read that is an immediate re-read the server answers at once,
        // after a quick one (a write still on its way) the plain pause — so a
        // slow write cannot make the strip spin.
        const held = cursor !== undefined && (cursor !== sent || Date.now() - started >= 1000);
        if (!held) await pause(REMOTE_POLL_MS);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [kitchen, refresh]);

  const send = useCallback(
    async (order: RemoteRequest, call: () => Promise<unknown>) => {
      setBusy((prev) => new Set(prev).add(order.id));
      guard.begin();
      try {
        await call();
        if (mountedRef.current) {
          setRequests((prev) => prev.filter((o) => o.id !== order.id));
          setConfirmed((prev) => prev.filter((o) => o.id !== order.id));
        }
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося відповісти — спробуйте ще раз'));
      } finally {
        guard.end();
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
    [guard, refresh]
  );

  return {
    requests,
    confirmed,
    offset,
    banner,
    busy,
    answer: (order, minutes) => send(order, () => api.answerWithTime(order, minutes)),
    decline: (order, reason) => send(order, () => api.decline(order, reason)),
    declineDishes: (order, itemIds) => send(order, () => api.declineDishes(order, itemIds)),
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
