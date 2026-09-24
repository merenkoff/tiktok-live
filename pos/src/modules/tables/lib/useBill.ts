// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen's data and the writes it makes (phase К4f, К4l).
//
// Every mutation answers with the whole bill — that is the server's shape
// (К4b/К4c), and it is the right one here: a fired round changes the draft,
// the totals and the rounds at once, and re-reading the bill is cheaper than
// patching three pieces of local state and hoping they agree.
//
// Optimistic for the DRAFT, and for nothing else (§4.13). A tap on a tile
// shows its line at once and sends the request behind it, because a draft
// line is not money — the server previews it, the round prices it. A round,
// a payment, a cancellation and the pre-bill all wait for the server's word:
// each of those moves stock or locks prices, and a screen that shows a round
// as fired before the server says so is a screen that can be wrong about
// money.
//
// One queue, one request in flight. Every answer is the whole bill and is
// newer than the one before, so applying them in order is all the ordering
// there is — and a tap can never race the «На кухню» that follows it.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tablesApi from './tablesApi';
import * as mirror from '../data/mirror';
import { pendingLine } from './draft';
import type { DishChoice, PendingLine } from './draft';
import { serverMessage } from './useHallMap';
import type { Bill } from './types';

export interface BillState {
  bill: Bill | null;
  loading: boolean;
  /** The bill could not be read at all. */
  error: string | null;
  /** A write the server refused, in its words. */
  banner: string | null;
  /** A blocking write — round, payment, cancel, pre-bill, ± — is in flight. */
  busy: boolean;
  /** Taps the server has not answered yet, in tap order. */
  pending: PendingLine[];
  /** Bumped after a write that moved stock, so the menu re-reads what is left. */
  epoch: number;
  /** This bill came out of the till's mirror, not off the server (К4j). */
  stale: boolean;
  savedAt: number | null;
  clearBanner: () => void;
  reload: () => Promise<void>;
  /** Put a dish on the draft: on the screen now, on the server next. */
  addLine: (choice: DishChoice) => void;
  /**
   * Runs a blocking `write`, keeps whatever bill it answers with, and shows a
   * refusal. `stock` says the write moves stock, so the menu should refresh.
   */
  run: (write: () => Promise<Bill>, opts?: { stock?: boolean }) => Promise<boolean>;
}

export interface BillOptions {
  online: boolean;
  /** Keep a copy on this device — the till and the tablet (§4.12). */
  mirrored?: boolean;
  storeId?: number | null;
}

type Job =
  | { kind: 'add'; token: string; write: () => Promise<Bill> }
  | { kind: 'blocking'; stock: boolean; write: () => Promise<Bill>; resolve: (ok: boolean) => void };

function newToken(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random()}`;
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
  const [pending, setPending] = useState<PendingLine[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const queueRef = useRef<Job[]>([]);
  const pumpingRef = useRef(false);
  // Read synchronously by `run`: the state may lag a tap by a render.
  const blockingRef = useRef(false);

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

  /** Drain the queue, one request at a time, applying each answer as it lands. */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    let failed = false;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!;
        if (job.kind === 'blocking') {
          blockingRef.current = true;
          setBusy(true);
        }
        try {
          const fresh = await job.write();
          if (mountedRef.current) {
            setBill(fresh);
            setStale(false);
            setSavedAt(null);
            if (job.kind === 'blocking' && job.stock) setEpoch((e) => e + 1);
          }
          if (mirrored && storeId != null) void mirror.saveBill(storeId, fresh);
          if (job.kind === 'blocking') job.resolve(true);
        } catch (err) {
          failed = true;
          if (mountedRef.current) {
            // The server's words, not ours: «Позиція вже на кухні», «сьогодні
            // в стоп-листі», «Стіл зайнятий» all say exactly what to do next.
            setBanner(serverMessage(err, 'Не вдалося зберегти'));
          }
          if (job.kind === 'blocking') job.resolve(false);
        } finally {
          if (job.kind === 'add' && mountedRef.current) {
            // Answered either way: the server's draft now has it, or it never
            // will — a refused tap leaves the screen with the refusal.
            setPending((p) => p.filter((x) => x.token !== job.token));
          }
          if (job.kind === 'blocking') {
            blockingRef.current = false;
            if (mountedRef.current) setBusy(false);
          }
        }
      }
    } finally {
      pumpingRef.current = false;
    }
    // One re-read after the batch rather than one per refusal: whatever the
    // server refused, its draft is the truth the screen goes back to.
    if (failed && mountedRef.current) void reload();
  }, [mirrored, storeId, reload]);

  const addLine = useCallback(
    (choice: DishChoice) => {
      // A write needs the server, always: the mirror is a cache, not a queue,
      // and a round fired into it would wake no kitchen (§4.10).
      if (!online) {
        setBanner('Потрібна мережа');
        return;
      }
      setBanner(null);
      const token = newToken();
      const line = pendingLine(choice, token);
      setPending((p) => [...p, line]);
      queueRef.current.push({
        kind: 'add',
        token,
        write: () =>
          tablesApi.addLine(billId, {
            variant_id: line.variant_id,
            quantity: 1,
            modifiers: line.modifiers,
            note: line.note,
          }),
      });
      void pump();
    },
    [billId, online, pump]
  );

  const run = useCallback(
    (write: () => Promise<Bill>, opts: { stock?: boolean } = {}): Promise<boolean> => {
      // A second «На кухню» while the first is in flight would be a second
      // uuid, i.e. a second round of an empty draft — refused, not queued.
      if (blockingRef.current) return Promise.resolve(false);
      if (!online) {
        setBanner('Потрібна мережа');
        return Promise.resolve(false);
      }
      setBanner(null);
      return new Promise<boolean>((resolve) => {
        queueRef.current.push({ kind: 'blocking', stock: opts.stock === true, write, resolve });
        void pump();
      });
    },
    [online, pump]
  );

  return {
    bill,
    loading,
    error,
    banner,
    busy,
    pending,
    epoch,
    stale,
    savedAt,
    clearBanner: () => setBanner(null),
    reload,
    addLine,
    run,
  };
}
