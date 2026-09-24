// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Потребують уваги» — what the owner should look at today, read from the
// endpoints that already exist rather than from a new one: today's stop-list
// (a café), today's and overdue pre-orders, stock running low, and ПРРО
// documents the retry cron gave up on. The same list feeds the numbers in the
// admin sidebar, so it lives in one small store both read.
//
// Every source is independent and optional: a store without the stock module
// answers 403 there, a store without ПРРО is never asked, and a failure of one
// source never hides the others — the block is a hint, not a report.

import { create } from 'zustand';
import { api } from '@pos/platform';
import type { CatalogItem, LowStockRow, Preorder } from '../../types';
import { CalendarClock, ChefHat, ShieldCheck, Warehouse, type Glyph } from '../../platform/glyphs';
import { ukPlural } from '../../lib/plural';

export interface AttentionItem {
  key: string;
  glyph: Glyph;
  text: string;
  /** Where it comes from, as a small outlined tag: «Кухня», «Склад», «ПРРО». */
  tag: string;
  /** A time or a number on the right. */
  meta?: string;
  /** An admin route to open; absent where the thing lives on the till. */
  to?: string;
  /** Something is wrong, not merely waiting — red in the sidebar. */
  alert?: boolean;
}

export interface AttentionSources {
  /** The store's vertical — only a café has a stop-list. */
  vertical: string;
  fiscalEnabled: boolean;
}

/** `YYYY-MM-DD` of `at` on this device — the stop-list's own day (К3). */
export function deviceDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(at);
}

function hhmm(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** What the kitchen is not making today, one row per dish — or one row for many. */
export function stopListItems(catalog: readonly CatalogItem[], today: string): AttentionItem[] {
  const names = new Map<number, string>();
  for (const item of catalog) {
    if (item.stop_listed_on === today) names.set(item.product_id, item.product_name);
  }
  const list = [...names.values()];
  if (list.length === 0) return [];
  if (list.length > 3) {
    return [
      {
        key: 'stop',
        glyph: ChefHat,
        text: `${list.length} ${ukPlural(list.length, 'страва', 'страви', 'страв')} у стоп-листі до кінця дня`,
        tag: 'Кухня',
      },
    ];
  }
  return list.map((name) => ({
    key: `stop:${name}`,
    glyph: ChefHat,
    text: `${name} — у стоп-листі до кінця дня`,
    tag: 'Кухня',
  }));
}

/** Open pre-orders due today, and any already late — the late ones first. */
export function preorderItems(preorders: readonly Preorder[], now: Date): AttentionItem[] {
  const today = deviceDay(now);
  return preorders
    .filter((p) => p.status === 'new' || p.status === 'assembled')
    .map((p) => ({ p, due: new Date(p.due_at) }))
    .filter(({ due }) => !Number.isNaN(due.getTime()) && (deviceDay(due) === today || due < now))
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map(({ p, due }) => {
      // Assembled and waiting on the shelf is on time as far as the shop goes;
      // only one nobody has assembled yet is late.
      const late = due < now && p.status === 'new';
      const lines = p.items.length;
      const who = p.recipient_name || p.customer_name;
      return {
        key: `preorder:${p.id}`,
        glyph: CalendarClock,
        text: [
          late ? `Прострочене передзамовлення на ${hhmm(due)}` : `Передзамовлення на ${hhmm(due)}`,
          `${lines} ${ukPlural(lines, 'позиція', 'позиції', 'позицій')}`,
          who,
        ]
          .filter(Boolean)
          .join(' · '),
        tag: 'Передзамовлення',
        meta: deviceDay(due) === today ? hhmm(due) : undefined,
        alert: late,
      };
    });
}

/** Stock at or under its minimum. */
export function lowStockItems(rows: readonly LowStockRow[]): AttentionItem[] {
  if (rows.length === 0) return [];
  const first = rows[0];
  const name = [first.product_name, first.label].filter(Boolean).join(' · ');
  return [
    {
      key: 'low-stock',
      glyph: Warehouse,
      text:
        rows.length === 1
          ? `${name} закінчується — ${first.quantity} ${first.unit || 'шт'}`
          : `${rows.length} ${ukPlural(rows.length, 'товар закінчується', 'товари закінчуються', 'товарів закінчуються')}`,
      tag: 'Склад',
      meta: rows.length === 1 ? undefined : String(rows.length),
      to: '/admin/stock',
    },
  ];
}

/** ПРРО documents the retry gave up on, and offline sessions parked `stuck`. */
export function fiscalItems(att: { documents: readonly unknown[]; sessions: readonly unknown[] }): AttentionItem[] {
  const out: AttentionItem[] = [];
  const docs = att.documents.length;
  if (docs > 0) {
    out.push({
      key: 'fiscal-docs',
      glyph: ShieldCheck,
      text: `${docs} ${ukPlural(docs, 'чек не зареєстровано', 'чеки не зареєстровано', 'чеків не зареєстровано')} в ПРРО`,
      tag: 'ПРРО',
      to: '/admin/fiscal',
      alert: true,
    });
  }
  const sessions = att.sessions.length;
  if (sessions > 0) {
    out.push({
      key: 'fiscal-sessions',
      glyph: ShieldCheck,
      text: `${sessions} ${ukPlural(sessions, 'офлайн-сесія чекає', 'офлайн-сесії чекають', 'офлайн-сесій чекають')} на передачу`,
      tag: 'ПРРО',
      to: '/admin/fiscal',
      alert: true,
    });
  }
  return out;
}

/** The sidebar's numbers, by route: everything on «Сьогодні», and each item's own page. */
export function navCounts(items: readonly AttentionItem[]): Record<string, { count: number; alert?: boolean }> {
  const counts: Record<string, { count: number; alert?: boolean }> = {};
  if (items.length > 0) counts['/admin'] = { count: items.length };
  for (const item of items) {
    if (!item.to) continue;
    const n = item.meta && /^\d+$/.test(item.meta) ? Number(item.meta) : 1;
    const prev = counts[item.to];
    counts[item.to] = { count: (prev?.count ?? 0) + n, alert: Boolean(prev?.alert || item.alert) };
  }
  return counts;
}

async function settle<T>(p: Promise<T>, pick: (v: T) => AttentionItem[]): Promise<AttentionItem[]> {
  try {
    return pick(await p);
  } catch {
    return [];
  }
}

export async function loadAttention(src: AttentionSources, now = new Date()): Promise<AttentionItem[]> {
  const parts = await Promise.all([
    src.fiscalEnabled
      ? settle(
          api.posRequest<{ documents: unknown[]; sessions: unknown[] }>('get', '/fiscal/attention'),
          (a) => fiscalItems({ documents: a.documents ?? [], sessions: a.sessions ?? [] })
        )
      : Promise.resolve([]),
    settle(api.listPreorders({ status: 'open' }), (list) => preorderItems(list, now)),
    src.vertical === 'cafe'
      ? settle(api.getCatalog(), (items) => stopListItems(items, deviceDay(now)))
      : Promise.resolve([]),
    settle(api.stockLow(), lowStockItems),
  ]);
  return parts.flat();
}

/** How long a loaded list is good for before a route change asks again. */
const FRESH_MS = 60_000;

interface AttentionState {
  items: AttentionItem[] | null;
  loadedAt: number;
  load: (src: AttentionSources, opts?: { force?: boolean }) => Promise<void>;
}

export const useAttention = create<AttentionState>((set, get) => ({
  items: null,
  loadedAt: 0,
  async load(src, opts = {}) {
    if (!opts.force && Date.now() - get().loadedAt < FRESH_MS) return;
    set({ loadedAt: Date.now() });
    const items = await loadAttention(src);
    set({ items });
  },
}));
