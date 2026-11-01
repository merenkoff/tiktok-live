// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/urls.ts — the addresses a store's guest menu answers
// at, as pure functions of a `pos_stores` row.
//
// Apart from `menu.service.ts` because the login (`core/auth.ts`) and the
// bill (`bills.service.ts`) need the feedback address too (phase F7: the QR
// «Оцініть нас» on the pre-bill and the receipt), and neither may pull the
// menu's catalogue, cache and tag code along with it.

import { verticalOrDefault } from '../verticals/index.js';

/** What a menu key — a token or a slug — may look like in `/m/<key>`. */
export const MENU_KEY_RE = /^[A-Za-z0-9_-]{3,64}$/;

/** The hash the guest page opens its feedback sheet on (`menu.js`, `initFeedback`). */
export const FEEDBACK_HASH = '#feedback';

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || 'https://the-live.shop').replace(/\/+$/, '');
}

export function menuUrl(key: string): string {
  return `${publicBaseUrl()}/m/${key}`;
}

/** Where a dish's own addresses hang (phase F11): `<menu>/d`; the id follows. */
export function dishUrlBase(key: string): string {
  return `${menuUrl(key)}/d`;
}

/** The menu's Open Graph picture (F15): the version in the address, so a new logo is a new picture to a messenger's cache. */
export function menuOgImageUrl(key: string, version: string): string {
  return `${menuUrl(key)}/og.png?v=${version}`;
}

/** A dish's own address for pasting into a chat (F11) — the menu's key only, never a table's. */
export function dishUrl(key: string, productId: number): string {
  return `${dishUrlBase(key)}/${productId}`;
}

/**
 * The address a table's QR carries: the menu, plus which table asked. Without
 * a key it only captions the page; with the table's key (`?k=`) the guest may
 * also read that table's bill.
 */
export function tableMenuUrl(key: string, tableId: number, tableKey?: string): string {
  return `${menuUrl(key)}?t=${tableId}${tableKey ? `&k=${tableKey}` : ''}`;
}

/** The slug as it would stand in `/m/<slug>`, or null when it cannot (an old seed's odd code). */
export function slugKey(row: { slug?: unknown } | undefined): string | null {
  const slug = typeof row?.slug === 'string' ? row.slug : null;
  return slug !== null && slug === slug.toLowerCase() && MENU_KEY_RE.test(slug) ? slug : null;
}

/** The `pos_stores` columns the menu's addresses are decided by. */
export interface MenuKeySource {
  slug: unknown;
  vertical: unknown;
  public_menu_enabled: unknown;
  public_menu_token: unknown;
  public_menu_slug_enabled: unknown;
}

/**
 * The key the store's QR codes carry — its slug when the owner chose the short
 * address (phase Q10, the shorter QR), else its token — or null while the menu
 * is off, has no token yet, or the vertical has no kitchen to publish.
 */
export function menuKeyOf(row: MenuKeySource): string | null {
  if (row.public_menu_enabled !== true) return null;
  if (!verticalOrDefault(row.vertical as string | undefined).kitchen) return null;
  const token = typeof row.public_menu_token === 'string' && MENU_KEY_RE.test(row.public_menu_token) ? row.public_menu_token : null;
  if (!token) return null;
  return (row.public_menu_slug_enabled === true && slugKey(row)) || token;
}

/**
 * The key the feedback QR on paper points at, or null: the menu's key only
 * while the owner's «Приймати відгуки гостей» is on — the page shows no sheet
 * otherwise, and a QR that opens the menu with nothing to rate would be a
 * broken promise on every receipt.
 */
export function feedbackMenuKey(row: MenuKeySource & { public_menu_feedback: unknown }): string | null {
  if (row.public_menu_feedback !== true) return null;
  return menuKeyOf(row);
}

/**
 * The address printed as the QR «Оцініть нас». With a keyed table (the
 * pre-bill) the feedback attaches to that table and its bill, so the guest
 * also rates the dishes and a low score reaches the hall map; without one
 * (the counter's receipt) it is the plain sheet.
 */
export function feedbackUrl(key: string, table?: { id: number; key: string | null | undefined } | null): string {
  const base = table ? tableMenuUrl(key, table.id, table.key ?? undefined) : menuUrl(key);
  return `${base}${FEEDBACK_HASH}`;
}
