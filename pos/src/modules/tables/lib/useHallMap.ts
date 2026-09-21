// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The hall map's data: the room and who is sitting in it, polled together
// (phase К4e). Same «plain interval, no react-query» reasoning as the kitchen
// board — this bundle shares only `@pos/platform` with the host, and one
// interval is not worth a data layer.
//
// Two reads, not one: the room changes when the owner edits it (rarely) and
// the bills change every few seconds (constantly). They are fetched together
// anyway, because a tile needs both and two round-trips on a tablet are
// cheaper than the state machine that would avoid the second.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tablesApi from './tablesApi';
import * as mirror from '../data/mirror';
import type { OpenBillSummary, PosHall } from './types';

export const POLL_MS = 10000;

export interface HallMapData {
  halls: PosHall[];
  bills: OpenBillSummary[];
  /** The server's clock at the last read — every «seated for» is measured on it. */
  now: string;
  loading: boolean;
  /** The room could not be read at all (network, host too old, no room yet). */
  error: string | null;
  /** This room came out of the till's mirror, not off the server (К4j). */
  stale: boolean;
  /** When the mirror was written, for the «станом на» line. */
  savedAt: number | null;
  refresh: () => Promise<void>;
}

export interface HallMapOptions {
  /** Read the server. False while the till is out of range. */
  online: boolean;
  /**
   * Keep a copy on this device. Only the desktop till: the waiter's tablet is
   * the web shell, which has no offline runtime at all (§4.12), and writing a
   * mirror there would be a cache nothing could ever read.
   */
  mirrored?: boolean;
  /** Whose room this is — a till that changed store must not show the old one. */
  storeId?: number | null;
}

export function serverMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return fallback;
}

export function useHallMap({ online, mirrored = false, storeId = null }: HallMapOptions): HallMapData {
  const [halls, setHalls] = useState<PosHall[]>([]);
  const [bills, setBills] = useState<OpenBillSummary[]>([]);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Draw whatever the till remembers, and say that it is a memory. */
  const fromMirror = useCallback(async () => {
    if (!mirrored || storeId == null) return false;
    const row = await mirror.loadRoom(storeId);
    if (!row || !mountedRef.current) return false;
    setHalls(row.halls);
    setBills(row.bills);
    setNow(row.now);
    setStale(true);
    setSavedAt(row.savedAt);
    setLoading(false);
    return true;
  }, [mirrored, storeId]);

  const refresh = useCallback(async () => {
    try {
      const [room, open] = await Promise.all([tablesApi.listHalls(), tablesApi.listOpenBills()]);
      if (!mountedRef.current) return;
      setHalls(room.halls);
      setBills(open.bills);
      setNow(new Date().toISOString());
      setError(null);
      setStale(false);
      setSavedAt(null);
      if (mirrored && storeId != null) {
        // Written after the screen has the answer, never before: the mirror is
        // a convenience and must not sit between the waiter and the server.
        void mirror.saveRoom(storeId, {
          halls: room.halls,
          bills: open.bills,
          now: new Date().toISOString(),
        });
        void mirror.pruneBills(storeId, open.bills.map((b) => b.id));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // A read that failed falls back to the mirror rather than to an empty
      // room: «Wi-Fi моргнув» must not look like «столів немає».
      const drawn = await fromMirror();
      if (mountedRef.current && !drawn) setError(serverMessage(err, 'Не вдалося прочитати зал'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fromMirror, mirrored, storeId]);

  // Offline: the mirror is all there is, and it is read once rather than
  // polled — nothing on this device is going to change it.
  useEffect(() => {
    if (online) return;
    void (async () => {
      const drawn = await fromMirror();
      if (mountedRef.current && !drawn) setLoading(false);
    })();
  }, [online, fromMirror]);

  useEffect(() => {
    if (!online) return;
    void refresh();
    const id = setInterval(() => {
      // A tab nobody is looking at polls nothing: the waiter's tablet sleeps
      // in an apron pocket half the evening. `visibilityState` rather than
      // the shorter boolean property, and that word is avoided even in this
      // comment: Tailwind scans module source for class candidates, so it
      // would emit a bare `display:none` utility into the module's stylesheet
      // and override the host's responsive layout — К3c lost an afternoon
      // to exactly that.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [online, refresh]);

  return { halls, bills, now, loading, error, stale, savedAt, refresh };
}
