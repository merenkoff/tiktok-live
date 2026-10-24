// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Writes whose answer never came, remembered until the server settles them.
//
// Every debt write is idempotent on `client_uuid`: the same key again is the
// same entry, the same return, the same receipt — but only if the till sends
// the same key. Inside one open sheet that is the sheet's own business. This
// is for the cashier who closes the sheet after «no answer» and opens it
// again: a fresh key would make a write that did land the first time happen
// twice — a second debt for the same bread, a second return of the same jar.
//
// A scope names what a remembered key may be replayed for:
//  · a handover — the customer, the goods and the cart discount, because a
//    replay answers with what the FIRST attempt wrote and the host then
//    empties the cart, so a different cart must never be finished by it;
//  · a repayment, a return, a write-off — the customer and the kind: the
//    statement behind them is read again after the replay either way, and the
//    server refuses a key spent on another kind or customer (`uuid_taken`).
//
// Module-level, because on a phone the cart's slots are mounted twice (the
// hidden sidebar and the sheet). And for half an hour only: a timeout older
// than that says nothing about the cart in front of the cashier now — a
// replay that does fire says so on the success pane anyway.

import type { CartDiscount } from '@pos/platform';
import type { IssueItem } from './types';

export const UNANSWERED_TTL_MS = 30 * 60_000;

const unanswered = new Map<string, { key: string; at: number }>();

/** A handover's scope: who, what, and the discount shared over it. */
export function issueScope(customerId: number, items: IssueItem[], cartDiscount: CartDiscount | null): string {
  return `issue:${customerId}:${JSON.stringify([items, cartDiscount])}`;
}

/** Any other write's scope: the kind and the customer. */
export function customerScope(kind: 'pay' | 'return' | 'writeoff', customerId: number): string {
  return `${kind}:${customerId}`;
}

/** The key of an unanswered write in this scope, while it is still worth replaying. */
export function unansweredKey(scope: string, now = Date.now()): string | null {
  const hit = unanswered.get(scope);
  if (!hit) return null;
  if (now - hit.at > UNANSWERED_TTL_MS) {
    unanswered.delete(scope);
    return null;
  }
  return hit.key;
}

/** No answer came: the next attempt in this scope must send the same key. */
export function rememberUnanswered(scope: string, key: string, now = Date.now()): void {
  unanswered.set(scope, { key, at: now });
}

/** The server answered — with a result or a refusal: nothing is left to replay here. */
export function settle(scope: string): void {
  unanswered.delete(scope);
}

/** Tests only: a clean slate. */
export function resetUnanswered(): void {
  unanswered.clear();
}
