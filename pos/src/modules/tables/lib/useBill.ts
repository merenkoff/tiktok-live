// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen's data and the writes it makes (phase К4f).
//
// Every mutation answers with the whole bill — that is the server's shape
// (К4b/К4c), and it is the right one here: a fired round changes the draft,
// the totals and the rounds at once, and re-reading the bill is cheaper than
// patching three pieces of local state and hoping they agree.
//
// No optimistic updates. The kitchen board can afford one because a tap there
// is a state change with one outcome; here a write moves stock and locks
// prices, and a screen that shows a round as fired before the server says so
// is a screen that can be wrong about money.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tablesApi from './tablesApi';
import * as mirror from '../data/mirror';
import { serverMessage } from './useHallMap';
import type { Bill } from './types';

export interface BillState {
  bill: Bill | null;
  loading: boolean;
  /** The bill could not be read at all. */
  error: string | null;
  /** A write the server refused, in its words. */
  banner: string | null;
  busy: boolean;
  /** This bill came out of the till's mirror, not off the server (К4j). */
  stale: boolean;
  savedAt: number | null;
  clearBanner: () => void;
  reload: () => Promise<void>;
  /** Runs `write`, keeps whatever bill it answers with, and shows a refusal. */
  run: (write: () => Promise<Bill>) => Promise<boolean>;
}

export interface BillOptions {
  online: boolean;
  /** Keep a copy on this device — the till only (§4.12). */
  mirrored?: boolean;
  storeId?: number | null;
}

export function useBill(
  billId: number,
  { online, mirrored = false, storeId = null }: BillOptions = { online: true }
): BillState {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Draw what the till remembers of this bill, and say that it is a memory. */
  const fromMirror = useCallback(async () => {
    if (!mirrored || storeId == null) return false;
    const row = await mirror.loadBill(storeId, billId);
    if (!row || !mountedRef.current) return false;
    setBill(row.bill);
    setStale(true);
    setSavedAt(row.savedAt);
    setLoading(false);
    return true;
  }, [billId, mirrored, storeId]);

  const reload = useCallback(async () => {
    // Out of range the server is not asked at all — the bill lives there
    // (§4.10) and a read would only turn «Потрібна мережа» into a timeout.
    // What the till remembers is shown instead, marked as a memory; coming
    // back online re-runs this and the screen fills itself.
    if (!online) {
      const drawn = await fromMirror();
      if (mountedRef.current && !drawn) setLoading(false);
      return;
    }
    try {
      const fresh = await tablesApi.getBill(billId);
      if (!mountedRef.current) return;
      setBill(fresh);
      setError(null);
      setStale(false);
      setSavedAt(null);
      if (mirrored && storeId != null) void mirror.saveBill(storeId, fresh);
    } catch (err) {
      if (!mountedRef.current) return;
      const drawn = await fromMirror();
      if (mountedRef.current && !drawn) {
        setError(serverMessage(err, 'Не вдалося прочитати рахунок'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [billId, online, fromMirror, mirrored, storeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (write: () => Promise<Bill>): Promise<boolean> => {
      if (busy) return false;
      // A write needs the server, always: the mirror is a cache, not a queue,
      // and a round fired into it would wake no kitchen (§4.10).
      if (!online) {
        setBanner('Потрібна мережа');
        return false;
      }
      setBusy(true);
      setBanner(null);
      try {
        const fresh = await write();
        if (mountedRef.current) {
          setBill(fresh);
          setStale(false);
          setSavedAt(null);
        }
        if (mirrored && storeId != null) void mirror.saveBill(storeId, fresh);
        return true;
      } catch (err) {
        if (mountedRef.current) {
          // The server's words, not ours: «Позиція вже на кухні», «Стіл
          // зайнятий», «Раунди вже на кухні» all say exactly what to do next.
          setBanner(serverMessage(err, 'Не вдалося зберегти'));
          void reload();
        }
        return false;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy, online, reload, mirrored, storeId]
  );

  return {
    bill,
    loading,
    error,
    banner,
    busy,
    stale,
    savedAt,
    clearBanner: () => setBanner(null),
    reload,
    run,
  };
}
