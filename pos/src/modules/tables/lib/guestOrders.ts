// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers for a guest's requests on the waiter's screens (phase Q7,
// TechDocs/POS_QR_MENU.md). Kept apart from the panel so the small rules a
// waiter feels — which lines can go in, what the button says, how long the
// guest has been waiting — are testable without rendering anything.

import type { GuestOrder, GuestOrderLine } from './types';

/** The guest has been waiting «3 хв»; never negative, whatever the two clocks say. */
export function minutesWaiting(createdAt: string, nowMs: number = Date.now()): number {
  const minutes = Math.floor((nowMs - new Date(createdAt).getTime()) / 60_000);
  return Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
}

/** «щойно», «3 хв тому» — the request's age, in the words a waiter reads at a glance. */
export function waitingLabel(createdAt: string, nowMs: number = Date.now()): string {
  const minutes = minutesWaiting(createdAt, nowMs);
  return minutes < 1 ? 'щойно' : `${minutes} хв тому`;
}

/** «1 запит», «2 запити», «5 запитів». */
export function requestsLabel(n: number): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return `${n} запитів`;
  if (units === 1) return `${n} запит`;
  if (units >= 2 && units <= 4) return `${n} запити`;
  return `${n} запитів`;
}

/** How many requests wait at each table — what the tile's badge counts. */
export function waitingByTable(orders: readonly GuestOrder[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const order of orders) counts.set(order.table_id, (counts.get(order.table_id) ?? 0) + 1);
  return counts;
}

/**
 * The request lines that cannot go in: the ones the server flagged when it
 * listed them (stopped today, taken off the menu) and the ones a refused
 * accept has just named (`refused` — the dish that ran out between the poll
 * and the tap). One set, because to the waiter they are the same thing.
 */
export function blockedLineIds(order: GuestOrder, refused: ReadonlySet<number> = new Set()): number[] {
  return order.lines.filter((line) => line.problem != null || refused.has(line.id)).map((line) => line.id);
}

/** What accepting would put on the bill: the request without its blocked lines. */
export function acceptableLines(order: GuestOrder, refused: ReadonlySet<number> = new Set()): GuestOrderLine[] {
  const blocked = new Set(blockedLineIds(order, refused));
  return order.lines.filter((line) => !blocked.has(line.id));
}

/**
 * The accept button's words, from what is blocked.
 *
 * Nothing blocked — a plain «Прийняти». Something blocked — the button says
 * out loud that it leaves that out, because a waiter who taps «Прийняти» on a
 * request and finds one dish missing from the bill has been lied to by the
 * button. Everything blocked — no button at all (`null`): the only honest
 * answer is to turn the request down.
 */
export function acceptLabel(order: GuestOrder, refused: ReadonlySet<number> = new Set()): string | null {
  const blocked = blockedLineIds(order, refused).length;
  if (blocked === 0) return 'Прийняти';
  if (blocked >= order.lines.length) return null;
  return blocked === 1 ? 'Прийняти без цієї' : 'Прийняти без них';
}

/**
 * The request line a refused accept names, if it names one: the server's
 * `item_id` on a 409. Anything else (a network error, a plain 400) is not
 * about a line and marks none.
 */
export function refusedLineId(error: unknown): number | null {
  const data = (error as { response?: { status?: number; data?: { item_id?: unknown } } })?.response?.data;
  const id = Number(data?.item_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * What a waiter may tell the guest when turning a request down. The guest
 * reads it on their phone under «Офіціант не зміг прийняти», so each one is
 * a sentence a guest can act on — and none of them is a blame.
 */
export const REJECT_REASONS: readonly string[] = [
  'Цієї страви вже немає',
  'Кухня зараз не приймає — підійдіть до офіціанта',
  'Підійде офіціант і прийме замовлення',
];
