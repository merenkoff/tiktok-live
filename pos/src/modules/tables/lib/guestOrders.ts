// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers for a guest's requests on the waiter's screens (phase Q7,
// TechDocs/POS_QR_MENU.md). Kept apart from the panel so the small rules a
// waiter feels — which lines can go in, what the button says, how long the
// guest has been waiting — are testable without rendering anything.

import type { GuestOrder, GuestOrderLine, LowFeedback, SentGuestOrder, WaiterCall, WaiterCallKind } from './types';

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

/** The Ukrainian count: `plural(2, 'запит', 'запити', 'запитів')` → «2 запити». */
export function plural(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return `${n} ${many}`;
  if (units === 1) return `${n} ${one}`;
  if (units >= 2 && units <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** «1 запит», «2 запити», «5 запитів». */
export function requestsLabel(n: number): string {
  return plural(n, 'запит', 'запити', 'запитів');
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

// ── calls and orders that went straight to the kitchen (Q8/Q9) ──────────────

/** What a call asks for, as the card's headline says it. */
export function callWords(kind: WaiterCallKind): string {
  return kind === 'bill' ? 'Просить рахунок' : 'Кличе офіціанта';
}

/** What is going on at one table, for its tile: no words there, only marks. */
export interface TableAlerts {
  /** Requests waiting for a waiter to accept (Q6/Q7). */
  requests: number;
  /** Somebody pressed «Покликати офіціанта». */
  waiter: boolean;
  /** Somebody pressed «Попросити рахунок». */
  bill: boolean;
  /** Orders already in the kitchen that nobody has said «Бачу» to. */
  sent: number;
  /** The lowest score a guest gave from this table lately, or null (F6). */
  low: number | null;
}

export const NO_ALERTS: TableAlerts = { requests: 0, waiter: false, bill: false, sent: 0, low: null };

/** Per table, everything the guests' phones are saying. */
export function alertsByTable(feed: {
  orders: readonly GuestOrder[];
  sent: readonly SentGuestOrder[];
  calls: readonly WaiterCall[];
  feedback?: readonly LowFeedback[];
}): Map<number, TableAlerts> {
  const map = new Map<number, TableAlerts>();
  const at = (tableId: number): TableAlerts => {
    let entry = map.get(tableId);
    if (!entry) {
      entry = { ...NO_ALERTS };
      map.set(tableId, entry);
    }
    return entry;
  };
  for (const order of feed.orders) at(order.table_id).requests += 1;
  for (const order of feed.sent) at(order.table_id).sent += 1;
  for (const call of feed.calls) at(call.table_id)[call.kind] = true;
  for (const low of feed.feedback ?? []) {
    const entry = at(low.table_id);
    entry.low = entry.low == null ? low.score : Math.min(entry.low, low.score);
  }
  return map;
}

/** How many separate things want the waiter at a table — what a hall tab counts. */
export function alertCount(alerts: TableAlerts | undefined): number {
  if (!alerts) return 0;
  return alerts.requests + alerts.sent + (alerts.waiter ? 1 : 0) + (alerts.bill ? 1 : 0) + (alerts.low != null ? 1 : 0);
}

/**
 * One key per thing on the screen, so a chime can tell a NEW call from the
 * same one read again by the next poll. Prefixed by kind: a request and a call
 * may share an id.
 */
export function alertKeys(feed: {
  orders: readonly GuestOrder[];
  sent: readonly SentGuestOrder[];
  calls: readonly WaiterCall[];
  feedback?: readonly LowFeedback[];
}): Set<string> {
  return new Set([
    ...feed.orders.map((o) => `order:${o.id}`),
    ...feed.sent.map((o) => `sent:${o.id}`),
    ...feed.calls.map((c) => `call:${c.id}`),
    ...(feed.feedback ?? []).map((f) => `feedback:${f.id}`),
  ]);
}

/** «Уже на кухні · замовлення 3» — what the card of an auto-sent order says under its table. */
export function sentCaption(order: SentGuestOrder): string {
  return order.round_seq == null ? 'Уже на кухні' : `Уже на кухні · замовлення ${order.round_seq}`;
}

/** The header over the room's list: «2 виклики · 1 на кухні · 3 запити», only what there is. */
export function feedHeadline(counts: { requests: number; sent: number; calls: number; feedback?: number }): string {
  const parts: string[] = [];
  if (counts.calls > 0) parts.push(plural(counts.calls, 'виклик', 'виклики', 'викликів'));
  if ((counts.feedback ?? 0) > 0) parts.push(plural(counts.feedback!, 'низька оцінка', 'низькі оцінки', 'низьких оцінок'));
  if (counts.sent > 0) parts.push(`${counts.sent} на кухні без офіціанта`);
  if (counts.requests > 0) parts.push(requestsLabel(counts.requests));
  return parts.join(' · ');
}

/** One other table that wants the waiter, as the bill screen's strip names it. */
export interface ElsewhereEntry {
  table_id: number;
  table_name: string;
  /** «кличе офіціанта», «просить рахунок», «замовив сам», «запит» — the most urgent first. */
  words: string;
}

/**
 * What the REST of the room is saying while the waiter is on one bill: a call
 * at table 5 must not wait until they walk back to the map. Ordered by
 * urgency — a call first, then an order already cooking, then a request.
 */
export function elsewhere(
  feed: { orders: readonly GuestOrder[]; sent: readonly SentGuestOrder[]; calls: readonly WaiterCall[] },
  currentTableId: number | null
): ElsewhereEntry[] {
  const names = new Map<number, string>();
  const rank = new Map<number, { score: number; words: string }>();
  const note = (tableId: number, tableName: string, score: number, words: string): void => {
    if (tableId === currentTableId) return;
    names.set(tableId, tableName);
    const prev = rank.get(tableId);
    if (!prev || score > prev.score) rank.set(tableId, { score, words });
  };
  for (const order of feed.orders) note(order.table_id, order.table_name, 1, 'запит');
  for (const order of feed.sent) note(order.table_id, order.table_name, 2, 'замовив сам');
  for (const call of feed.calls) {
    note(call.table_id, call.table_name, call.kind === 'waiter' ? 4 : 3, call.kind === 'waiter' ? 'кличе офіціанта' : 'просить рахунок');
  }
  return [...rank.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0] - b[0])
    .map(([tableId, { words }]) => ({ table_id: tableId, table_name: names.get(tableId) ?? '', words }));
}
