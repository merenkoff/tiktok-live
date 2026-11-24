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
//
// The bill is also re-read every few seconds while the screen is in view (Q7):
// a guest's request accepted from the hall map, or a round another waiter
// cancelled, must show up on the screen of the waiter standing at the table
// without a tap. The poll never competes with a write — it does not start
// while the queue has anything in it, and an answer that lands after a write
// began or finished is thrown away, because it is older than what the write
// answered with.
//
// A table nobody has ordered at yet has NO bill (§4.1): tapping a free table
// opens this screen on the table alone, and the table stays free on the map.
// The bill is opened by the first write that needs one — the guests' count,
// or the first dish — as the first job of the same queue, so the dish that
// caused it can never overtake it. Two waiters doing that at once land on one
// bill: the server answers with the bill already open on the table. While
// there is no bill the screen keeps looking for one by its table, so a guest's
// order accepted from the hall map, or another waiter seating it, shows up
// here without a tap.



import { useCallback, useEffect, useRef, useState } from 'react';
import * as tablesApi from './tablesApi';
import * as mirror from '../data/mirror';
import { pendingLine } from './draft';
import type { DishChoice, PendingLine } from './draft';
import { serverMessage } from './useHallMap';
import { useVisiblePoll } from './usePolling';
import { newUuid } from './uuid';
import type { Bill } from './types';

export interface BillState {
  /** The table's open bill — null while nobody has ordered at it (§4.1). */
  bill: Bill | null;
  /** The bill's id once there is one. */
  billId: number | null;
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
  /** Put a refusal the screen found itself on the banner, in the same voice. */
  notice: (text: string) => void;
  reload: () => Promise<void>;
  /** Put a dish on the draft: on the screen now, on the server next. Seats the table if it is free. */
  addLine: (choice: DishChoice) => void;
  /** The guests' count: seats a free table with it, or changes it on the open bill. */
  setGuests: (guests: number) => Promise<boolean>;
  /**
   * Runs a blocking `write` against the open bill, keeps whatever bill it
   * answers with, and shows a refusal. `stock` says the write moves stock, so
   * the menu should refresh. Refused while there is no bill yet.
   */
  run: (write: (billId: number) => Promise<Bill>, opts?: { stock?: boolean }) => Promise<boolean>;
  /**
   * Like `run`, for a write that opens the bill by itself when there is none
   * (accepting a guest's request): it is never preceded by seating the table.
   */
  runFree: (write: () => Promise<Bill>, opts?: { stock?: boolean }) => Promise<boolean>;
}

export interface BillOptions {
  online: boolean;
  /** Keep a copy on this device — the till and the tablet (§4.12). */
  mirrored?: boolean;
  storeId?: number | null;
}

/** Which bill the screen is about: a known one, or whatever is open on a table. */
export type BillTarget = { billId: number } | { tableId: number };

type Job =
  | { kind: 'add'; token: string; write: (billId: number) => Promise<Bill> }
  | {
      kind: 'blocking';
      stock: boolean;
      /** Null means «no bill yet»: only a write that copes with that gets it. */
      write: (billId: number | null) => Promise<Bill>;
      resolve: (ok: boolean) => void;
    };

const NO_BILL = 'Рахунок ще не відкрито';
/** Thrown for the dishes queued behind a seat the server refused: its sentence is already on the banner. */
const SEAT_REFUSED = new Error('seat refused');

export function useBill(
  target: BillTarget,
  { online, mirrored = false, storeId = null }: BillOptions = { online: true }
): BillState {
  const initialBillId = 'billId' in target ? target.billId : null;
  const targetTableId = 'tableId' in target ? target.tableId : null;
  const [bill, setBill] = useState<Bill | null>(null);
  const [billId, setBillId] = useState<number | null>(initialBillId);
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
  // Bumped whenever a write's answer is applied, so a read that started before
  // it can tell it is out of date.
  const writeSeqRef = useRef(0);
  // The bill and its table, read synchronously by the queue and the reads.
  const billIdRef = useRef<number | null>(initialBillId);
  const tableIdRef = useRef<number | null>(targetTableId);
  // One key per «this table has no bill yet»: a seat repeated after a timeout
  // is the same bill, never a second one.
  const seatUuidRef = useRef(newUuid());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Make this the screen's bill: its id for every write that follows, its table for every read. */
  const adopt = useCallback((fresh: Bill) => {
    billIdRef.current = fresh.id;
    tableIdRef.current = fresh.table_id;
    setBillId(fresh.id);
    setBill(fresh);
  }, []);

  /** The table's bill is gone (paid elsewhere, closed): back to a free table. */
  const forget = useCallback(() => {
    billIdRef.current = null;
    seatUuidRef.current = newUuid();
    setBillId(null);
    setBill(null);
  }, []);

  /**
   * The bill as the server has it now: by its id, or — while the screen knows
   * only its table — the one open on that table, or null when there is none.
   * A bill found closed on a table-only screen means the table is free again.
   */
  const read = useCallback(async (): Promise<Bill | null | 'gone'> => {
    const known = billIdRef.current;
    if (known != null) {
      const fresh = await tablesApi.getBill(known);
      if (targetTableId != null && fresh.status !== 'open') return 'gone';
      return fresh;
    }
    const table = tableIdRef.current;
    if (table == null) return null;
    const { bills } = await tablesApi.listOpenBills();
    const open = bills.find((b) => b.table_id === table);
    return open ? tablesApi.getBill(open.id) : null;
  }, [targetTableId]);

  /** Draw what the till remembers of this bill, and say that it is a memory. */
  const fromMirror = useCallback(async () => {
    const known = billIdRef.current;
    if (!mirrored || storeId == null || known == null) return false;
    const row = await mirror.loadBill(storeId, known);
    if (!row || !mountedRef.current) return false;
    setBill(row.bill);
    setStale(true);
    setSavedAt(row.savedAt);
    setLoading(false);
    return true;
  }, [mirrored, storeId]);

  /** Apply what a read found, unless a write has answered since it started. */
  const applyRead = useCallback(
    (found: Bill | null | 'gone', seq: number, quiet: boolean): void => {
      if (!mountedRef.current || seq !== writeSeqRef.current) return;
      if (found === 'gone') {
        forget();
      } else if (found == null) {
        // Still nobody at the table: nothing to draw, nothing to change.
      } else if (found.id !== billIdRef.current) {
        adopt(found);
      } else {
        setBill((prev) =>
          quiet && prev != null && JSON.stringify(prev) === JSON.stringify(found) ? prev : found
        );
      }
      setError(null);
      setStale(false);
      setSavedAt(null);
      if (found && found !== 'gone' && mirrored && storeId != null) void mirror.saveBill(storeId, found);
    },
    [adopt, forget, mirrored, storeId]
  );

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
    const seq = writeSeqRef.current;
    try {
      applyRead(await read(), seq, false);
    } catch (err) {
      if (!mountedRef.current) return;
      const drawn = await fromMirror();
      if (mountedRef.current && !drawn) {
        setError(serverMessage(err, 'Не вдалося прочитати рахунок'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [online, fromMirror, read, applyRead]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * One quiet re-read. Unlike `reload` it never shows an error (a blink of the
   * Wi-Fi must not put a banner over a bill that is on screen), never falls
   * back to the mirror (that is `reload`'s job on the first draw), and never
   * replaces the bill with an identical one.
   */
  const poll = useCallback(async () => {
    const busyNow = () => pumpingRef.current || queueRef.current.length > 0;
    if (!online || busyNow()) return;
    const seq = writeSeqRef.current;
    try {
      const found = await read();
      if (busyNow()) return;
      applyRead(found, seq, true);
    } catch {
      // The next tick tries again.
    }
  }, [online, read, applyRead]);

  useVisiblePoll(poll, online);

  /** Seat the table this screen is about, and make the bill the server answers with ours. */
  const seat = useCallback(async (): Promise<number> => {
    const table = tableIdRef.current;
    if (table == null) throw new Error(NO_BILL);
    const opened = await tablesApi.seatTable(table, { clientUuid: seatUuidRef.current });
    writeSeqRef.current += 1;
    if (mountedRef.current) adopt(opened.bill);
    return opened.bill.id;
  }, [adopt]);

  /** Drain the queue, one request at a time, applying each answer as it lands. */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    let failed = false;
    // A table that could not be seated fails every dish waiting on it, with
    // one sentence on the banner rather than one request each.
    let seatRefused = false;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!;
        if (job.kind === 'blocking') {
          blockingRef.current = true;
          setBusy(true);
        }
        try {
          let fresh: Bill;
          if (job.kind === 'add') {
            if (seatRefused) throw SEAT_REFUSED;
            let id = billIdRef.current;
            if (id == null) {
              try {
                id = await seat();
              } catch (err) {
                seatRefused = true;
                throw err;
              }
            }
            fresh = await job.write(id);
          } else {
            fresh = await job.write(billIdRef.current);
          }
          writeSeqRef.current += 1;
          if (mountedRef.current) {
            adopt(fresh);
            setStale(false);
            setSavedAt(null);
            if (job.kind === 'blocking' && job.stock) setEpoch((e) => e + 1);
          }
          if (mirrored && storeId != null) void mirror.saveBill(storeId, fresh);
          if (job.kind === 'blocking') job.resolve(true);
        } catch (err) {
          failed = true;
          const repeat = err === SEAT_REFUSED;
          if (mountedRef.current && !repeat) {
            // The server's words, not ours: «Позиція вже на кухні», «сьогодні
            // в стоп-листі», «Стіл зайнятий» all say exactly what to do next.
            const ours = err instanceof Error && err.message === NO_BILL;
            setBanner(serverMessage(err, ours ? NO_BILL : 'Не вдалося зберегти'));
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
  }, [adopt, mirrored, storeId, reload, seat]);

  const addLine = useCallback(
    (choice: DishChoice) => {
      // A write needs the server, always: the mirror is a cache, not a queue,
      // and a round fired into it would wake no kitchen (§4.10).
      if (!online) {
        setBanner('Потрібна мережа');
        return;
      }
      setBanner(null);
      const token = newUuid();
      const line = pendingLine(choice, token);
      setPending((p) => [...p, line]);
      queueRef.current.push({
        kind: 'add',
        token,
        write: (id) =>
          tablesApi.addLine(id, {
            variant_id: line.variant_id,
            quantity: line.quantity,
            modifiers: line.modifiers,
            note: line.note,
          }),
      });
      void pump();
    },
    [online, pump]
  );

  const clearBanner = useCallback(() => setBanner(null), []);
  /** Say something in the bill's own voice — a refusal the screen found before the server could. */
  const notice = useCallback((text: string) => setBanner(text), []);

  const enqueue = useCallback(
    (write: (billId: number | null) => Promise<Bill>, stock: boolean): Promise<boolean> => {
      // A second «На кухню» while the first is in flight would be a second
      // uuid, i.e. a second round of an empty draft — refused, not queued.
      if (blockingRef.current) return Promise.resolve(false);
      if (!online) {
        setBanner('Потрібна мережа');
        return Promise.resolve(false);
      }
      setBanner(null);
      return new Promise<boolean>((resolve) => {
        queueRef.current.push({ kind: 'blocking', stock, write, resolve });
        void pump();
      });
    },
    [online, pump]
  );

  const run = useCallback(
    (write: (billId: number) => Promise<Bill>, opts: { stock?: boolean } = {}): Promise<boolean> =>
      enqueue((id) => (id == null ? Promise.reject(new Error(NO_BILL)) : write(id)), opts.stock === true),
    [enqueue]
  );

  const runFree = useCallback(
    (write: () => Promise<Bill>, opts: { stock?: boolean } = {}): Promise<boolean> =>
      enqueue(() => write(), opts.stock === true),
    [enqueue]
  );

  const setGuests = useCallback(
    (guests: number): Promise<boolean> =>
      enqueue(async (id) => {
        if (id != null) return tablesApi.updateBill(id, { guests });
        const table = tableIdRef.current;
        if (table == null) throw new Error(NO_BILL);
        const opened = await tablesApi.seatTable(table, { guests, clientUuid: seatUuidRef.current });
        // Somebody seated it a moment ago with another count: ours is the newer word.
        if (!opened.created && opened.bill.guests !== guests) {
          return tablesApi.updateBill(opened.bill.id, { guests });
        }
        return opened.bill;
      }, false),
    [enqueue]
  );

  return {
    bill,
    billId,
    loading,
    error,
    banner,
    busy,
    pending,
    epoch,
    stale,
    savedAt,
    clearBanner,
    notice,
    reload,
    addLine,
    setGuests,
    run,
    runFree,
  };
}
