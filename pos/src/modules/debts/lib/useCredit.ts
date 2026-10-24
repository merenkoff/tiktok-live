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

import { useCallback, useEffect, useState } from 'react';
import { debtsApi } from './debtsApi';
import type { DebtCredit } from './types';

const known = new Map<number, DebtCredit>();
const listeners = new Set<(customerId: number) => void>();

/** Every write answers with the credit as it now stands; this tells the screen. */
export function publishCredit(credit: DebtCredit): void {
  known.set(credit.customer_id, credit);
  for (const listener of listeners) listener(credit.customer_id);
}

/** For tests: forget what was read. */
export function resetCreditCache(): void {
  known.clear();
}

export interface CreditState {
  credit: DebtCredit | null;
  /** The read failed — the caller draws nothing rather than an error over the cart. */
  failed: boolean;
  reload: () => void;
}

export function useCredit(customerId: number | null): CreditState {
  const [credit, setCredit] = useState<DebtCredit | null>(() =>
    customerId == null ? null : (known.get(customerId) ?? null)
  );
  const [failed, setFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (customerId == null) return undefined;
    const listener = (id: number) => {
      if (id === customerId) setCredit(known.get(id) ?? null);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [customerId]);

  useEffect(() => {
    if (customerId == null) {
      setCredit(null);
      setFailed(false);
      return undefined;
    }
    let live = true;
    setCredit(known.get(customerId) ?? null);
    setFailed(false);
    debtsApi
      .balance(customerId)
      .then((next) => {
        if (!live) return;
        publishCredit(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [customerId, epoch]);

  const reload = useCallback(() => setEpoch((n) => n + 1), []);
  return { credit, failed, reload };
}
