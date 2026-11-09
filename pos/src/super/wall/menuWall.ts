// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The office television's pure logic (TechDocs/POS_MENU_WALL.md): the places
// of a snapshot with their colours, the ranking, the tabs that rotate, the
// celebrations a poll's new opens turn into, and the Kyiv clock. Nothing here
// renders, so every rule is testable on its own.
//
// Carried over from the «Малин» stop-sticker widget (`StickerWallPage/stickerWall.ts`)
// with restaurants in place of bus stops: a place has no line colour of its own,
// so it gets one from a fixed palette by its rank among ids, stable between polls.

import type { MenuWallEvent, MenuWallSnapshot, MenuWallStore } from '../superApi';

/** How often the screen asks for a snapshot: opens are sparse, 30 s is «at once» to a person in the room. */
export const WALL_POLL_MS = 30_000;
/** How long one celebration stays on screen. */
export const CELEBRATION_MS = 7_000;
/** The tabs — «Заклади» and a plan per place — change by themselves this often. */
export const TAB_ROTATE_MS = 20_000;
/** A table opened this recently still pulses on the plan. */
export const RECENT_MS = 2 * 60_000;

/** Eight colours that read apart on a dark screen; a ninth place gets the first again. */
export const PLACE_PALETTE: string[] = ['#2a78d6', '#e8574a', '#2fb37a', '#f2a93b', '#8a6cef', '#1b9df0', '#e45e9d', '#14b8a6'];
const FALLBACK_COLOR = PLACE_PALETTE[0];

export type WallStore = MenuWallStore & {
  /** The place's colour on this screen. */
  color: string;
  /** The letter drawn where there is no logo. */
  initial: string;
};

/** The first letter of the name, past any opening quote: «Шабля» → Ш. */
export function initialOf(name: string): string {
  const trimmed = name.replace(/^[\s«"'“‘(]+/, '');
  const first = [...trimmed][0];
  return first ? first.toUpperCase() : '?';
}

/**
 * The snapshot's places with a colour each. The colour follows the place's
 * position among ids, not today's rank — a place keeps its colour from one
 * poll to the next and from one day to the next, whatever the ranking does.
 */
export function wallStores(snapshot: MenuWallSnapshot | null): WallStore[] {
  if (!snapshot) return [];
  const ids = snapshot.stores.map((s) => s.id).sort((a, b) => a - b);
  return snapshot.stores.map((s) => ({
    ...s,
    color: PLACE_PALETTE[ids.indexOf(s.id) % PLACE_PALETTE.length] ?? FALLBACK_COLOR,
    initial: initialOf(s.name),
  }));
}

/** «Заклади»: most opens today first; equal — the fresher open higher; then by name. */
export function rankedStores(stores: readonly WallStore[]): WallStore[] {
  return [...stores].sort(
    (a, b) =>
      b.today - a.today || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name, 'uk') || a.id - b.id
  );
}

/** How many rows the ranking shows before it folds the rest into one line. */
export const RANK_ROWS = 8;

export interface RankingView {
  rows: WallStore[];
  /** Places past the rows that had an open today — folded, but not idle. */
  hiddenActive: number;
  /** Places past the rows with nothing today. */
  hiddenIdle: number;
}

export function rankingView(stores: readonly WallStore[], limit = RANK_ROWS): RankingView {
  const ranked = rankedStores(stores);
  const rows = ranked.slice(0, limit);
  const rest = ranked.slice(limit);
  const hiddenIdle = rest.filter((s) => s.today === 0).length;
  return { rows, hiddenActive: rest.length - hiddenIdle, hiddenIdle };
}

/** The places that get a tab of their own: a table of theirs was scanned today and there is a plan to draw. */
export function placeTabs(stores: readonly WallStore[]): WallStore[] {
  return stores
    .filter((s) => s.tableToday > 0 && (s.halls?.some((h) => h.tables.length > 0) ?? false))
    .sort((a, b) => b.tableToday - a.tableToday || b.today - a.today || a.name.localeCompare(b.name, 'uk') || a.id - b.id);
}

export type WallTab = { kind: 'places' } | { kind: 'place'; storeId: number };

export const PLACES_TAB: WallTab = { kind: 'places' };

export function tabKey(tab: WallTab): string {
  return tab.kind === 'places' ? 'places' : `place:${tab.storeId}`;
}

export function sameTab(a: WallTab, b: WallTab): boolean {
  return tabKey(a) === tabKey(b);
}

/** Every tab in rotation order: «Заклади» first, then the places by their table scans. */
export function allTabs(stores: readonly WallStore[]): WallTab[] {
  return [PLACES_TAB, ...placeTabs(stores).map((s): WallTab => ({ kind: 'place', storeId: s.id }))];
}

/** The tab after `current`; a current tab that is gone (its place fell silent) starts over at «Заклади». */
export function nextTab(tabs: readonly WallTab[], current: WallTab): WallTab {
  if (tabs.length === 0) return PLACES_TAB;
  const at = tabs.findIndex((t) => sameTab(t, current));
  if (at < 0) return tabs[0];
  return tabs[(at + 1) % tabs.length];
}

/** «Стіл 7 · Тераса», or null for an open that named no table (the counter's QR, a link in a bio). */
export function whereLabel(e: { tableName: string | null; hallName: string | null }): string | null {
  if (!e.tableName) return null;
  return e.hallName ? `Стіл ${e.tableName} · ${e.hallName}` : `Стіл ${e.tableName}`;
}

/** What a no-table open is called on screen. */
export const NO_TABLE_LABEL = 'Загальне посилання';

/** How warm a table is drawn: nothing for zero, and even one open is clearly warm. */
export function heat(today: number, max: number): number {
  if (today <= 0 || max <= 0) return 0;
  return Math.min(1, 0.3 + 0.7 * (today / max));
}

export function isRecent(lastAt: string | null, now: Date, windowMs = RECENT_MS): boolean {
  return lastAt !== null && now.getTime() - Date.parse(lastAt) <= windowMs;
}

export type CelebrationKind = 'open' | 'first' | 'milestone' | 'record' | 'summary';

export interface Celebration {
  key: string;
  kind: CelebrationKind;
  /** The large caption above the name. */
  headline: string;
  storeId: number | null;
  name: string;
  /** «Стіл 7 · Тераса», «3 столи», «Загальне посилання» — or null for the summary. */
  where: string | null;
  color: string;
  /** How many new opens this celebrates. */
  added: number;
  /** The place's opens today after these. */
  storeToday: number;
  /** The place's rank among the places today. */
  rank: number;
  /** All opens today after this celebration. */
  totalAfter: number;
}

export const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000];
/** A record is celebrated when the previous best day was at least this. */
const RECORD_MIN = 3;
const MAX_PLACE_CELEBRATIONS = 3;

/** Ukrainian plural forms: [1, 2–4, 5+]. */
export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export const opens = (n: number) => plural(n, ['відкриття', 'відкриття', 'відкриттів']);

function whereOfGroup(events: readonly MenuWallEvent[]): string {
  const tables = new Set(events.filter((e) => e.tableId != null).map((e) => e.tableId));
  if (tables.size > 1) return `${tables.size} ${plural(tables.size, ['стіл', 'столи', 'столів'])}`;
  const last = events[events.length - 1];
  return whereLabel(last) ?? NO_TABLE_LABEL;
}

/**
 * One poll's new opens → the celebrations to queue: one per place, in the order
 * the opens came. The first open of the day, a milestone crossed (10, 25,
 * 50…) and a beaten best day get their own headline. More than three places
 * at once fold into one «І ще відкриття».
 */
export function buildCelebrations(snapshot: MenuWallSnapshot, stores: readonly WallStore[]): Celebration[] {
  if (!snapshot.events.length) return [];
  const byId = new Map(stores.map((s) => [s.id, s]));
  const ranked = rankedStores(stores);
  const rankOf = (id: number) => ranked.findIndex((s) => s.id === id) + 1;
  const groups: { storeId: number; events: MenuWallEvent[] }[] = [];
  for (const e of snapshot.events) {
    const g = groups.find((x) => x.storeId === e.storeId);
    if (g) g.events.push(e);
    else groups.push({ storeId: e.storeId, events: [e] });
  }
  let running = Math.max(0, snapshot.total - snapshot.events.length);
  const best = snapshot.bestDay && snapshot.bestDay.count >= RECORD_MIN ? snapshot.bestDay.count : null;
  const out: Celebration[] = [];
  const shown = groups.length > MAX_PLACE_CELEBRATIONS + 1 ? groups.slice(0, MAX_PLACE_CELEBRATIONS) : groups;
  for (const g of shown) {
    const added = g.events.length;
    const before = running;
    running += added;
    const store = byId.get(g.storeId);
    let kind: CelebrationKind = 'open';
    let headline = added > 1 ? `+${added} відкриття меню` : 'Нове відкриття меню';
    const milestone = [...MILESTONES].reverse().find((m) => before < m && running >= m);
    if (before === 0) {
      kind = 'first';
      headline = 'Перше відкриття сьогодні!';
    } else if (best != null && before <= best && running > best) {
      kind = 'record';
      headline = `Рекорд дня! Уже ${running}`;
    } else if (milestone) {
      kind = 'milestone';
      headline = `Уже ${milestone} сьогодні!`;
    }
    out.push({
      key: `${g.storeId}-${g.events[g.events.length - 1].id}`,
      kind,
      headline,
      storeId: g.storeId,
      name: store?.name ?? `Заклад #${g.storeId}`,
      where: whereOfGroup(g.events),
      color: store?.color ?? FALLBACK_COLOR,
      added,
      storeToday: store?.today ?? added,
      rank: rankOf(g.storeId),
      totalAfter: running,
    });
  }
  const rest = groups.slice(shown.length);
  if (rest.length) {
    const added = rest.reduce((n, g) => n + g.events.length, 0);
    running += added;
    out.push({
      key: `rest-${rest[rest.length - 1].events.slice(-1)[0].id}`,
      kind: 'summary',
      headline: 'І ще відкриття',
      storeId: null,
      name: `Ще +${added} у ${rest.length} ${plural(rest.length, ['закладі', 'закладах', 'закладах'])}`,
      where: null,
      color: FALLBACK_COLOR,
      added,
      storeToday: 0,
      rank: 0,
      totalAfter: running,
    });
  }
  return out;
}

// ---- the Kyiv clock -----------------------------------------------------------

const KYIV = 'Europe/Kyiv';
const KYIV_HM = new Intl.DateTimeFormat('uk-UA', { timeZone: KYIV, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const KYIV_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: KYIV, hour: '2-digit', hourCycle: 'h23' });
const KYIV_DATE = new Intl.DateTimeFormat('uk-UA', { timeZone: KYIV, weekday: 'long', day: 'numeric', month: 'long' });

export function kyivHour(now: Date): number {
  return Number(KYIV_HOUR.format(now)) % 24;
}

export function kyivClock(now: Date): { time: string; date: string } {
  return { time: KYIV_HM.format(now), date: KYIV_DATE.format(now) };
}

/** «щойно», «5 хв тому», «2 год тому». */
export function agoLabel(iso: string | null, now: Date): string {
  if (!iso) return '';
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  return `${Math.floor(min / 60)} год тому`;
}

/** Quiet hours (no sound): 22:00–08:00 Kyiv. */
export function isQuietHour(now: Date): boolean {
  const h = kyivHour(now);
  return h >= 22 || h < 8;
}

/** Night (the screen dimmed): 23:00–06:00 Kyiv. */
export function isNightHour(now: Date): boolean {
  const h = kyivHour(now);
  return h >= 23 || h < 6;
}

/** White or black on a colour, whichever reads better (WCAG relative luminance). */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return l > 0.45 ? '#111522' : '#ffffff';
}

// ---- what the screen remembers -----------------------------------------------

export interface WallSettings {
  sound: boolean;
  quietNights: boolean;
}
export const DEFAULT_WALL_SETTINGS: WallSettings = { sound: true, quietNights: true };
const SETTINGS_KEY = 'menuWallSettings';
const KEY_STORAGE = 'menuWallKey';

export function loadWallSettings(): WallSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_WALL_SETTINGS, ...(JSON.parse(raw) as Partial<WallSettings>) } : DEFAULT_WALL_SETTINGS;
  } catch {
    return DEFAULT_WALL_SETTINGS;
  }
}

export function saveWallSettings(s: WallSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode — the settings last until the reload */
  }
}

export function storedWallKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function storeWallKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* without storage the key stays in the page's address */
  }
}

/** The address the super admin's tab hands out — on the POS web's own origin. */
export function wallUrl(origin: string, key: string): string {
  return `${origin}/super/wall?key=${encodeURIComponent(key)}`;
}
