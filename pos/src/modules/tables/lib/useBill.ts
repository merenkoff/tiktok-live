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
  clearBanner: () => void;
  reload: () => Promise<void>;
  /** Runs `write`, keeps whatever bill it answers with, and shows a refusal. */
  run: (write: () => Promise<Bill>) => Promise<boolean>;
}

export function useBill(billId: number, online = true): BillState {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    // Nothing to try while the tablet is out of range: the bill lives on the
    // server (§4.10), so a read would only turn «Потрібна мережа» into a
    // timeout. Coming back online re-runs this effect, so the screen fills
    // itself rather than waiting to be told.
    if (!online) return;
    try {
      const fresh = await tablesApi.getBill(billId);
      if (!mountedRef.current) return;
      setBill(fresh);
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(serverMessage(err, 'Не вдалося прочитати рахунок'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [billId, online]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (write: () => Promise<Bill>): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setBanner(null);
      try {
        const fresh = await write();
        if (mountedRef.current) setBill(fresh);
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
    [busy, reload]
  );

  return {
    bill,
    loading,
    error,
    banner,
    busy,
    clearBanner: () => setBanner(null),
    reload,
    run,
  };
}
