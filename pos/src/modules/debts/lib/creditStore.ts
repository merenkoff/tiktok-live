// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The credit the server last answered for each customer, and who to tell when
// it changes. React-free on purpose: the desktop's queue sync (`data/sync.ts`)
// announces what a replayed handover answered, and it is statically imported
// by the manifest — it must not drag the screens' hooks into the entry chunk.
//
// On the desktop till every such answer is also the mirror's (`data/mirror.ts`):
// whatever the server last said about a customer is what the till goes by
// when the network is gone, whichever screen happened to ask.

import { api, isOfflinePosEnabled } from '@pos/platform';
import { rememberCredit } from '../data/mirror';
import type { DebtCredit } from './types';

const known = new Map<number, DebtCredit>();
const listeners = new Set<(customerId: number) => void>();

/** Tell the screen, and only the screen — for a caller that has just written the mirror itself. */
export function announceCredit(credit: DebtCredit): void {
  known.set(credit.customer_id, credit);
  for (const listener of listeners) listener(credit.customer_id);
}

/**
 * Every read and write answers with the credit as it now stands: this tells
 * the screen and, on the desktop, the mirror. `who` names a customer the
 * mirror may not have met yet.
 */
export function publishCredit(credit: DebtCredit, who?: { name: string; phone?: string | null }): void {
  announceCredit(credit);
  if (!isOfflinePosEnabled()) return;
  const storeId = api.loadAuth()?.store.id;
  if (storeId != null) void rememberCredit(storeId, credit, who);
}

export function knownCredit(customerId: number): DebtCredit | null {
  return known.get(customerId) ?? null;
}

export function onCredit(listener: (customerId: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: forget what was read. */
export function resetCreditCache(): void {
  known.clear();
}

/**
 * The credit with the handovers this till wrote down and the server has not
 * got yet added on top: the goods have left, so the till must reason with the
 * debt as it really is, not as the server last heard it.
 */
export function withPending(credit: DebtCredit, pendingCents: number): DebtCredit {
  if (pendingCents <= 0) return credit;
  const balance = credit.balance_cents + pendingCents;
  return {
    ...credit,
    balance_cents: balance,
    available_cents: credit.limit_cents == null ? null : Math.max(0, credit.limit_cents - balance),
  };
}
