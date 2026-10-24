// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One customer's credit, shared by everything of this module on the screen.
//
// The cart draws the strip under the customer (`customer.Panel`) and the
// «Під запис» button (`checkout.Action`) side by side, and both talk about
// the same debt. After the button writes goods to the tab the strip must say
// the new balance at once — so a write publishes the answer it got, and every
// reader of that customer re-renders from it, with no second request.
//
// On the desktop till (PR3) two more things are true. Without a network, or
// when the server does not answer, the credit comes from the till's own mirror
// (`data/mirror.ts`) — what the server said last — and every online read
// refreshes that mirror. And in both cases the handovers this till wrote down
// and has not sent yet are added on top: the goods are gone, so the debt the
// till reasons with is the real one, not the one the server has heard of.

import { useCallback, useEffect, useState } from 'react';
import { api, isOfflinePosEnabled, useAuthStore, useOfflineStatus } from '@pos/platform';
import { mirroredCredit, noCredit } from '../data/mirror';
import { debtsApi } from './debtsApi';
import { knownCredit, onCredit, publishCredit, withPending } from './creditStore';
import { usePending, type Pending } from './usePending';
import type { DebtCredit } from './types';

export { publishCredit, resetCreditCache } from './creditStore';

export interface CreditState {
  credit: DebtCredit | null;
  /** Nothing to show — the caller draws nothing rather than an error over the cart. */
  failed: boolean;
  /** Read from the till's own mirror: no network, or the server did not answer. */
  local: boolean;
  /** The till never had the list, so without a network it cannot vouch for anyone. */
  unknown: boolean;
  /** This till's handovers for the customer that the server has not got yet — already in `credit`. */
  pending: Pending;
  reload: () => void;
}

export function useCredit(customerId: number | null): CreditState {
  const online = useOfflineStatus((s) => s.online);
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const queue = isOfflinePosEnabled();
  const pending = usePending(customerId);
  const [base, setBase] = useState<DebtCredit | null>(() => (customerId == null ? null : knownCredit(customerId)));
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (customerId == null) return undefined;
    return onCredit((id) => {
      if (id !== customerId) return;
      setBase(knownCredit(id));
      setFailed(false);
      setLocal(false);
      setUnknown(false);
    });
  }, [customerId]);

  useEffect(() => {
    setFailed(false);
    setLocal(false);
    setUnknown(false);
    if (customerId == null) {
      setBase(null);
      return undefined;
    }
    let live = true;
    setBase(knownCredit(customerId));

    // The desktop falls back on its mirror; anywhere else a failed read draws nothing.
    const fallBack = async () => {
      if (!queue || storeId == null) {
        if (live) setFailed(true);
        return;
      }
      const mirrored = await mirroredCredit(storeId, customerId);
      if (!live) return;
      setLocal(true);
      if (mirrored === 'unknown') {
        setBase(null);
        setUnknown(true);
        setFailed(true);
      } else {
        setBase(mirrored === 'none' ? noCredit(customerId) : mirrored.credit);
      }
    };

    // An offline login holds no token the server would take: the mirror it is.
    if (!online || (queue && !api.hasLiveJwt())) {
      void fallBack();
      return () => {
        live = false;
      };
    }
    debtsApi
      .balance(customerId)
      .then((next) => {
        // On the desktop this is also the mirror's word for the next outage.
        if (live) publishCredit(next);
      })
      .catch(() => {
        if (live) void fallBack();
      });
    return () => {
      live = false;
    };
  }, [customerId, epoch, online, queue, storeId]);

  const reload = useCallback(() => setEpoch((n) => n + 1), []);
  const credit = base ? withPending(base, pending.cents) : null;
  return { credit, failed, local, unknown, pending, reload };
}
