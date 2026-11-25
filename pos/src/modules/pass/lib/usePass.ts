// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The screen's data and its two writes (TechDocs/POS_PASS.md, B2).
//
// The room is read every five seconds while the screen is in view — the
// kitchen calls «Готово», another waiter carries the borscht, a new round is
// fired — and so is «Винесено» of the table the waiter has chosen.
//
// «Несу» is optimistic: the plate leaves the list at once and the request
// goes behind it, because a waiter holding three plates does not wait for a
// spinner. Two rules keep that honest, the same two as the bill screen's:
//
// 1. A read that started before a write began or finished is thrown away —
//    it is older than what the write did, and applying it would put a plate
//    just carried back on the screen for five seconds.
// 2. A request that got NO answer (a timeout, a blink of the Wi-Fi) keeps its
//    `client_uuid` for two minutes: tapping the same plates again replays it
//    on the server instead of carrying them twice. A refusal is an answer, and
//    the next tap is a new tray.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as passApi from './passApi';
import { hasAnswer, serverMessage } from './hostPlatform';
import { carriedWords, dishTitle, withCarrying } from './feed';
import type { ServingFeed, ServingHistoryRow, ServingLine } from './types';
import { useVisiblePoll } from './usePolling';
import { newUuid } from './uuid';

/** How often the room is read while the screen is in view. */
export const PASS_POLL_MS = 5000;
/** How long a tray that got no answer keeps its key for a repeat. */
const REPLAY_MS = 2 * 60 * 1000;

export interface CarryToast {
  text: string;
  eventIds: number[];
}

export interface PassState {
  /** The room as it will be once the taps on their way land; null until the first read. */
  feed: ServingFeed | null;
  loading: boolean;
  /** The room could not be read at all. */
  error: string | null;
  /** A write the server refused, in its words — or the network's silence. */
  banner: string | null;
  /** The last tray, with «Повернути» while it stands. */
  toast: CarryToast | null;
  /** «Винесено» of the chosen bill, newest first; null while unread. */
  history: ServingHistoryRow[] | null;
  carry: (items: Array<{ line: ServingLine; quantity: number }>) => Promise<boolean>;
  undo: (eventIds: number[]) => Promise<boolean>;
  clearBanner: () => void;
  clearToast: () => void;
  reload: () => Promise<void>;
}

export function usePass({ online, billId }: { online: boolean; billId: number | null }): PassState {
  const [feed, setFeed] = useState<ServingFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<CarryToast | null>(null);
  const [history, setHistory] = useState<ServingHistoryRow[] | null>(null);
  const [carrying, setCarrying] = useState<ReadonlyMap<number, number>>(new Map());
  const mountedRef = useRef(true);
  // Bumped when a write starts and when it ends: a read that saw another
  // number is older than the write, and is dropped.
  const writeSeqRef = useRef(0);
  const writingRef = useRef(0);
  const billRef = useRef(billId);
  billRef.current = billId;
  const lastAttemptRef = useRef<{ key: string; uuid: string; at: number } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const read = useCallback(
    async (quiet: boolean) => {
      if (!online) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      const seq = writeSeqRef.current;
      const bill = billRef.current;
      try {
        const [fresh, served] = await Promise.all([
          passApi.getFeed(),
          bill == null ? Promise.resolve(null) : passApi.getServingBill(bill),
        ]);
        if (!mountedRef.current || seq !== writeSeqRef.current || writingRef.current > 0) return;
        setFeed(fresh);
        setError(null);
        if (bill === billRef.current) setHistory(served ? served.history : null);
      } catch (err) {
        if (mountedRef.current && !quiet) setError(serverMessage(err, 'Не вдалося прочитати роздачу'));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [online]
  );

  useEffect(() => {
    void read(false);
  }, [read]);

  // A new table chosen: its «Винесено» is read at once, not on the next tick.
  useEffect(() => {
    setHistory(null);
    if (billId != null) void read(true);
  }, [billId, read]);

  useVisiblePoll(() => read(true), online, PASS_POLL_MS);

  const carry = useCallback(
    async (items: Array<{ line: ServingLine; quantity: number }>): Promise<boolean> => {
      if (items.length === 0) return false;
      if (!online) {
        setBanner('Потрібна мережа');
        return false;
      }
      setBanner(null);
      const key = items
        .map((i) => `${i.line.id}:${i.quantity}`)
        .sort()
        .join(',');
      const last = lastAttemptRef.current;
      const uuid = last && last.key === key && Date.now() - last.at < REPLAY_MS ? last.uuid : newUuid();

      writeSeqRef.current += 1;
      writingRef.current += 1;
      setCarrying((prev) => {
        const next = new Map(prev);
        for (const item of items) next.set(item.line.id, (next.get(item.line.id) ?? 0) + item.quantity);
        return next;
      });
      let ok = false;
      try {
        const answer = await passApi.serve(
          uuid,
          items.map((i) => ({ bill_item_id: i.line.id, quantity: i.quantity }))
        );
        lastAttemptRef.current = null;
        ok = true;
        if (mountedRef.current) {
          setToast({
            text: carriedWords(items.map((i) => ({ name: dishTitle(i.line), quantity: i.quantity }))),
            eventIds: answer.events.map((e) => e.id),
          });
        }
      } catch (err) {
        if (hasAnswer(err)) {
          lastAttemptRef.current = null;
          if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося відмітити'));
        } else {
          // No answer: the plates may or may not be marked. The same tap
          // within two minutes replays this tray rather than adding one.
          lastAttemptRef.current = { key, uuid, at: Date.now() };
          if (mountedRef.current) setBanner('Немає відповіді — перевірте звʼязок і натисніть ще раз');
        }
      } finally {
        writingRef.current -= 1;
        writeSeqRef.current += 1;
        if (mountedRef.current) {
          setCarrying((prev) => {
            const next = new Map(prev);
            for (const item of items) {
              const left = (next.get(item.line.id) ?? 0) - item.quantity;
              if (left > 0) next.set(item.line.id, left);
              else next.delete(item.line.id);
            }
            return next;
          });
        }
      }
      await read(true);
      return ok;
    },
    [online, read]
  );

  const undo = useCallback(
    async (eventIds: number[]): Promise<boolean> => {
      if (!online) {
        setBanner('Потрібна мережа');
        return false;
      }
      setBanner(null);
      writeSeqRef.current += 1;
      writingRef.current += 1;
      let ok = false;
      try {
        await passApi.undo(eventIds);
        ok = true;
        if (mountedRef.current) setToast(null);
      } catch (err) {
        if (mountedRef.current) setBanner(serverMessage(err, 'Не вдалося повернути'));
      } finally {
        writingRef.current -= 1;
        writeSeqRef.current += 1;
      }
      await read(true);
      return ok;
    },
    [online, read]
  );

  const clearBanner = useCallback(() => setBanner(null), []);
  const clearToast = useCallback(() => setToast(null), []);
  const reload = useCallback(() => read(false), [read]);

  return {
    feed: feed ? withCarrying(feed, carrying) : null,
    loading,
    error,
    banner,
    toast,
    history,
    carry,
    undo,
    clearBanner,
    clearToast,
    reload,
  };
}
