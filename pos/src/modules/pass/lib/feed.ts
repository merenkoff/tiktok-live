// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers for «Роздача» (TechDocs/POS_PASS.md §2, Д2): what is left to
// carry, in which order the tables stand in the row, and the words the screen
// says. Apart from the page so the order a waiter walks in is testable
// without rendering anything.

import type { ServingFeed, ServingLine, ServingRound, ServingTable, Station } from './types';

/** Plates of a line still to carry. Never negative, whatever a stale screen says. */
export function leftOf(line: ServingLine): number {
  return Math.max(0, line.quantity - line.served_quantity);
}

/**
 * The feed as it will be once the taps still on their way land: each line
 * carried that much more, each table's count down by it. The tap shows at
 * once; the server's answer (or the next read) is what makes it true.
 */
export function withCarrying(feed: ServingFeed, carrying: ReadonlyMap<number, number>): ServingFeed {
  if (carrying.size === 0) return feed;
  return {
    ...feed,
    tables: feed.tables.map((table) => {
      const rounds = table.rounds.map((round) => ({
        ...round,
        items: round.items.map((line) => {
          const more = carrying.get(line.id) ?? 0;
          return more === 0 ? line : { ...line, served_quantity: Math.min(line.quantity, line.served_quantity + more) };
        }),
      }));
      return { ...table, rounds, to_serve: toServe(rounds) };
    }),
  };
}

function toServe(rounds: ServingRound[]): number {
  return rounds.reduce((sum, round) => sum + round.items.reduce((s, line) => s + leftOf(line), 0), 0);
}

/** A table's rounds with only the lines still to carry, and only rounds that have one. */
export function liveRounds(table: ServingTable): ServingRound[] {
  return table.rounds
    .map((round) => ({ ...round, items: round.items.filter((line) => leftOf(line) > 0) }))
    .filter((round) => round.items.length > 0);
}

/** What a table is waiting for: a plate on the pass, a plate in the pan, or nothing. */
export type TableState = 'ready' | 'cooking' | 'done';

export function tableState(table: ServingTable): TableState {
  const live = liveRounds(table);
  if (live.some((round) => round.prep_status === 'ready')) return 'ready';
  return live.length > 0 ? 'cooking' : 'done';
}

/**
 * The row of tables, in the order a waiter should walk: tables whose food is
 * on the pass first (the longest waiting first), then tables still cooking
 * (the earliest round first), then tables with nothing to carry — they stay
 * in the row, dimmed, because their «Винесено» is still worth opening.
 */
export function chipOrder(tables: readonly ServingTable[]): ServingTable[] {
  const rank: Record<TableState, number> = { ready: 0, cooking: 1, done: 2 };
  const since = (table: ServingTable): string => {
    const live = liveRounds(table);
    const ready = live.filter((r) => r.prep_status === 'ready').map((r) => r.ready_at ?? r.fired_at);
    const times = ready.length > 0 ? ready : live.map((r) => r.fired_at);
    return times.sort()[0] ?? '';
  };
  return [...tables].sort((a, b) => {
    const byState = rank[tableState(a)] - rank[tableState(b)];
    if (byState !== 0) return byState;
    const bySince = since(a).localeCompare(since(b));
    if (bySince !== 0) return bySince;
    return a.table_name.localeCompare(b.table_name, 'uk', { numeric: true });
  });
}

/** Plates still to carry over the whole room — the «Усі» chip's count. */
export function roomToServe(tables: readonly ServingTable[]): number {
  return tables.reduce((sum, table) => sum + table.to_serve, 0);
}

/** Whole minutes from `fromIso` to `nowIso`; never negative. */
export function minutesSince(fromIso: string, nowIso: string): number {
  return Math.max(0, Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 60000));
}

/** «19:42» on the device's clock. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Where to pick the plate up: «Кухня», «Бар», both, or nothing for a store with no stations. */
export function stationWord(stations: readonly Station[]): string | null {
  const kitchen = stations.includes('kitchen');
  const bar = stations.includes('bar');
  if (kitchen && bar) return 'Кухня, бар';
  if (bar) return 'Бар';
  if (kitchen) return 'Кухня';
  return null;
}

/** «винесено 1 з 3» under a line part of which has gone, else null. */
export function servedWords(line: ServingLine): string | null {
  return line.served_quantity > 0 ? `винесено ${line.served_quantity} з ${line.quantity}` : null;
}

/**
 * The counts offered on «Несете на стіл 5?» for a line with `left` plates:
 * one by one up to a hand's worth, and «Усі N» last, which is where the sheet
 * opens — three borschts for one table go out together far more often than
 * not, and the one-by-one chips are there for the time they do not.
 */
export function quantityChoices(left: number): number[] {
  if (left <= 1) return [1];
  const few = Array.from({ length: Math.min(left - 1, 5) }, (_, i) => i + 1);
  return [...few, left];
}

/** The line as the waiter reads it: «Борщ · з пампушками». */
export function dishTitle(line: Pick<ServingLine, 'product_name' | 'caption'>): string {
  return line.caption ? `${line.product_name} · ${line.caption}` : line.product_name;
}

/** The undo toast: «Борщ ×1 винесено» for one dish, «3 страви винесено» for a tray. */
export function carriedWords(items: Array<{ name: string; quantity: number }>): string {
  if (items.length === 1) return `${items[0].name} ×${items[0].quantity} винесено`;
  const plates = items.reduce((sum, item) => sum + item.quantity, 0);
  return `${platesLabel(plates)} винесено`;
}

/** «1 страва», «3 страви», «5 страв». */
export function platesLabel(n: number): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return `${n} страв`;
  if (units === 1) return `${n} страва`;
  if (units >= 2 && units <= 4) return `${n} страви`;
  return `${n} страв`;
}
