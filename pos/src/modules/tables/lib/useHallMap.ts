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
  refresh: () => Promise<void>;
}

export function serverMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string') return data.error;
  return fallback;
}

export function useHallMap(enabled: boolean): HallMapData {
  const [halls, setHalls] = useState<PosHall[]>([]);
  const [bills, setBills] = useState<OpenBillSummary[]>([]);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [room, open] = await Promise.all([tablesApi.listHalls(), tablesApi.listOpenBills()]);
      if (!mountedRef.current) return;
      setHalls(room.halls);
      setBills(open.bills);
      setNow(new Date().toISOString());
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(serverMessage(err, 'Не вдалося прочитати зал'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, refresh]);

  return { halls, bills, now, loading, error, refresh };
}
