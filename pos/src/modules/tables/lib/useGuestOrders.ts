// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The requests guests have sent from the QR menu, polled (phase Q7,
// TechDocs/POS_QR_MENU.md).
//
// Not part of `useHallMap` and not part of `useBill`: the map wants the whole
// room's requests and the bill wants one table's, and both want them to fail
// QUIETLY. A store that has not switched guest ordering on, a backend older
// than Q6 (a 404), a seller whose token cannot read them — none of those may
// put an error over a hall map or a bill that is otherwise fine, so a failed
// read leaves the last answer where it was and the next tick tries again.
//
// Nothing here is mirrored. A request is a live thing with a thirty-minute
// life; a copy on the till would be a list of guests nobody can still answer.
//
// The same answer also carries (Q8/Q9) the guests' calls — «покличте
// офіціанта», «принесіть рахунок» — and the orders that went straight to the
// kitchen without a waiter, until somebody says «Бачу». A backend older than
// that sends `orders` alone, which reads as no calls and nothing sent.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tablesApi from './tablesApi';
import { useVisiblePoll } from './usePolling';
import type { GuestOrder, LowFeedback, SentGuestOrder, WaiterCall } from './types';

export interface GuestOrdersState {
  orders: GuestOrder[];
  /** Orders already in the kitchen that no waiter has said «Бачу» to. */
  sent: SentGuestOrder[];
  /** Guests calling a waiter or asking for the bill, not yet answered. */
  calls: WaiterCall[];
  /** Low scores from tables in the last half hour nobody has walked over to (F6). */
  feedback: LowFeedback[];
  /** At least one answer has come back — until then the empty lists are «not known yet», not «nothing». */
  loaded: boolean;
  refresh: () => Promise<void>;
}

/** Same list, same object: a poll that found nothing new must not re-render a panel the waiter is tapping. */
function keep<T>(prev: T[], next: T[]): T[] {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

export interface GuestOrdersOptions {
  /** Read the server. False while the till is out of range. */
  online: boolean;
  /** One table's requests, or the whole room's when absent. */
  tableId?: number | null;
}

export function useGuestOrders({ online, tableId = null }: GuestOrdersOptions): GuestOrdersState {
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [sent, setSent] = useState<SentGuestOrder[]>([]);
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [feedback, setFeedback] = useState<LowFeedback[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!online) return;
    try {
      const answer = await tablesApi.listGuestOrders(tableId ?? undefined);
      if (!mountedRef.current) return;
      const nextOrders = Array.isArray(answer?.orders) ? answer.orders : [];
      const nextSent = Array.isArray(answer?.sent) ? answer.sent : [];
      const nextCalls = Array.isArray(answer?.calls) ? answer.calls : [];
      const nextFeedback = Array.isArray(answer?.feedback) ? answer.feedback : [];
      setOrders((prev) => keep(prev, nextOrders));
      setSent((prev) => keep(prev, nextSent));
      setCalls((prev) => keep(prev, nextCalls));
      setFeedback((prev) => keep(prev, nextFeedback));
      setLoaded(true);
    } catch {
      // Silence, on purpose — see the header.
    }
  }, [online, tableId]);

  useEffect(() => {
    if (!online) {
      setOrders([]);
      setSent([]);
      setCalls([]);
      setLoaded(false);
      return;
    }
    void refresh();
  }, [online, refresh]);

  useVisiblePoll(refresh, online);

  return { orders, sent, calls, feedback, loaded, refresh };
}
