// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers behind the kitchen's request panel (РК3). Pinned by
// `remote.test.ts`; nothing here touches React or the network.

import type { RemoteRequest } from '../remoteApi';

export const STEP_MIN = 5;
export const MIN_PREP = 5;
export const MAX_PREP = 180;

/** Only what still waits for the kitchen's word, oldest first. */
export function pendingRequests(orders: RemoteRequest[]): RemoteRequest[] {
  return orders
    .filter((o) => o.status === 'requested')
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at) || a.id - b.id);
}

/**
 * Where the cook's time starts: the kitchen's own numbers (the longest dish
 * plus the queue), without the road — the server adds the road itself. A
 * dish with no time set gives 20, rounded to the step.
 */
export function defaultPrep(order: Pick<RemoteRequest, 'prep_minutes' | 'load_minutes'>): number {
  const own = order.prep_minutes == null ? 20 : order.prep_minutes + (order.load_minutes ?? 0);
  return clampPrep(Math.ceil(own / STEP_MIN) * STEP_MIN);
}

export function clampPrep(minutes: number): number {
  return Math.min(MAX_PREP, Math.max(MIN_PREP, Math.round(minutes)));
}

/** What the guest will be told: cooking plus the road, up to the next five. */
export function guestMinutes(prep: number, transit: number | null): number {
  const total = prep + (transit ?? 0);
  return Math.max(5, Math.ceil(total / 5) * 5);
}

/** Seconds left to answer before the cafe is told to phone; null with no deadline. */
export function secondsToAnswer(deadline: string | null, offset: number, clientNow = Date.now()): number | null {
  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - (clientNow + offset)) / 1000));
}

/** Ids that were not in the previous read — each is one chime. */
export function newIds(previous: ReadonlySet<number>, current: RemoteRequest[]): number[] {
  return current.map((o) => o.id).filter((id) => !previous.has(id));
}
