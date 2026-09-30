// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The floor plan's way to the guest's QR menu (TechDocs/POS_QR_MENU.md, Q2).
//
// The owner lays a room out here, so this is where they reach for «the QR for
// THIS table». The QR itself is drawn by the server — a card at
// `<menu address>/qr?t=<table id>`, a sheet for every table at
// `<menu address>/tables` — so this module carries no QR library and needs no
// host symbol it did not already have: the address comes from the owner's
// `GET /store/public-menu`, through the same `posRequest` as everything else.
//
// Phase Q5: a table's QR also carries a KEY that lets the guest read the bill,
// and the print pages write it out only for a request that brings the owner's
// short-lived signed link (`print`, in the same settings answer) as `?p=`. The
// link lives six hours; an editor left open longer prints QR codes that still
// open the menu but not the bill, and the page says so.

import { posRequest } from './hostPlatform';

/**
 * Where the guest menu stands, as far as this screen needs to know.
 *
 * `none` is a store or a backend that has no such thing — a backend older than
 * the guest menu (404), a seller (403), a store with no kitchen — and it draws
 * NOTHING: a floor plan does not owe its owner an explanation of a feature
 * their shop cannot have. `off` is the one case worth a sentence, because the
 * owner can fix it in one tick and would otherwise wonder where the button is.
 */
export type PublicMenuState =
  | { kind: 'on'; url: string; print: string | null }
  | { kind: 'off' }
  | { kind: 'none' };

interface PublicMenuSettings {
  available?: boolean;
  enabled?: boolean;
  url?: string | null;
  print?: string | null;
}

/** What the server's print link looks like: `<expiry seconds>.<43 URL-safe characters>`. Anything else is not appended to a URL. */
const PRINT_LINK = /^\d{9,12}\.[A-Za-z0-9_-]{43}$/;

/** An address a link may point at: the server's own `https://…/m/<token>` (or `http://` on a dev box) — never a `javascript:` string. */
function isWebUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/** Read the owner's guest-menu settings, and never throw: a failure is «no menu», not a broken floor plan. */
export async function loadPublicMenu(): Promise<PublicMenuState> {
  try {
    const settings = await posRequest<PublicMenuSettings>('get', '/store/public-menu');
    if (settings?.available === false) return { kind: 'none' };
    if (settings?.enabled === true && isWebUrl(settings.url)) {
      const print = typeof settings.print === 'string' && PRINT_LINK.test(settings.print) ? settings.print : null;
      return { kind: 'on', url: settings.url.replace(/\/+$/, ''), print };
    }
    return settings?.available === true ? { kind: 'off' } : { kind: 'none' };
  } catch {
    return { kind: 'none' };
  }
}

/** The printable card for one table. With the print link its QR carries the table's key. */
export function tableQrUrl(menuUrl: string, tableId: number, print: string | null = null): string {
  return `${menuUrl}/qr?t=${tableId}${print ? `&p=${print}` : ''}`;
}

/** One page with a card for every live table. */
export function tablesSheetUrl(menuUrl: string, print: string | null = null): string {
  return `${menuUrl}/tables${print ? `?p=${print}` : ''}`;
}
