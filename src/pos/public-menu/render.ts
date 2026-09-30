// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/render.ts — the guest's pages as HTML strings.
//
// There is no template engine in this backend and the pages are small, so they
// are strings — which makes ONE rule non-negotiable: everything an owner types
// (the store's name, a dish, a description, a size, a modifier) goes through
// `escapeHtml` before it touches the markup, and nothing owner-typed is ever
// placed in a script. The page carries its data in `data-*` attributes and the
// JS that reads them lives in a static file, which is what lets the response's
// CSP say `script-src 'self'` and mean it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-generator';
import { deltaText, formatUahGuestCompact, groupHint, tableLabel } from './format.js';
import { phoneHref } from './profile.js';

export { tableLabel };
import {
  menuUrl,
  publicBaseUrl,
  tableMenuUrl,
  type MenuTable,
  type PublicMenu,
  type PublicMenuProduct,
  type PublicMenuStore,
} from './menu.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `public/` at the repo root — the same directory `api.ts` mounts at `/`. */
const PUBLIC_DIR = path.join(HERE, '..', '..', '..', 'public');

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The response headers for every guest page. The CSP is strict because it can
 * be: no inline script, no inline style, no framing, and images only from this
 * origin or https (an owner's picture may live elsewhere).
 */
export const MENU_PAGE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  // A stop-list that is minutes stale is the failure this page exists to avoid.
  'Cache-Control': 'no-store',
  // A menu is for the person standing at the counter, not for a search engine.
  // The AI crawlers in robots.txt have their own groups that ignore the `*`
  // Disallow, so the header and the meta tag are what actually say no.
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

let cachedVersion: string | null = null;

/** A cache-buster for the two static files: their mtimes, so an edit reaches phones without a manual bump. */
function assetVersion(): string {
  if (cachedVersion) return cachedVersion;
  let stamp = 0;
  for (const file of ['menu.css', 'menu.js']) {
    try {
      stamp = Math.max(stamp, Math.floor(fs.statSync(path.join(PUBLIC_DIR, 'menu-assets', file)).mtimeMs / 1000));
    } catch {
      // Not there (a test with no public/): an unversioned URL is still correct.
    }
  }
  cachedVersion = stamp ? String(stamp) : '0';
  return cachedVersion;
}

function shell(title: string, body: string, attrs = ''): string {
  const v = assetVersion();
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/menu-assets/menu.css?v=${v}">
</head>
<body${attrs}>
${body}
<script src="/menu-assets/menu.js?v=${v}" defer></script>
</body>
</html>
`;
}

// ── the menu ────────────────────────────────────────────────────────

/** The state a product is in, as the guest reads it. Stop wins over «немає», as on the till. */
function stateOf(product: PublicMenuProduct): 'ok' | 'stop' | 'out' {
  if (product.stopped) return 'stop';
  return product.available ? 'ok' : 'out';
}

const BADGE_TEXT = { ok: '', stop: 'стоп', out: 'немає' } as const;

function renderProduct(product: PublicMenuProduct, ordering = false): string {
  const state = stateOf(product);
  const multi = product.variants.length > 1;
  const price = multi
    ? `від ${formatUahGuestCompact(product.from_price_cents)}`
    : formatUahGuestCompact(product.from_price_cents);
  const sizes = multi
    ? `<ul class="sizes">${product.variants
        .map(
          (v) =>
            `<li data-variant="${v.id}" data-price="${v.price_cents}"${v.available ? '' : ' class="off"'}>` +
            `<span>${escapeHtml(v.label)}</span> <b>${formatUahGuestCompact(v.price_cents)}</b></li>`
        )
        .join('')}</ul>`
    : `<span hidden data-variant="${product.variants[0]!.id}" data-price="${product.variants[0]!.price_cents}"></span>`;
  const groups = product.modifier_groups.length
    ? `<details class="mods"><summary>Додатки</summary>${product.modifier_groups
        .map((g) => {
          const answers = g.modifiers
            .map((m) => {
              const delta = deltaText(m.price_delta_cents);
              return escapeHtml(m.name) + (delta ? ` <b>${delta}</b>` : '');
            })
            .join(' · ');
          return `<div class="group"><h4>${escapeHtml(g.name)} <small>${escapeHtml(groupHint(g))}</small></h4><p>${answers}</p></div>`;
        })
        .join('')}</details>`
    : '';
  const picture = product.image_url
    ? `<div class="pic"><img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" decoding="async"></div>`
    : '';
  return (
    `<li class="item" data-product="${product.id}" data-state="${state}">` +
    picture +
    `<div class="body"><h3>${escapeHtml(product.name)} <span class="badge">${BADGE_TEXT[state]}</span></h3>` +
    (product.description ? `<p class="desc">${escapeHtml(product.description)}</p>` : '') +
    `<p class="price">${price}</p>${sizes}${groups}` +
    (ordering ? `<button type="button" class="add" data-add="${product.id}">Додати</button>` : '') +
    `</div></li>`
  );
}

/**
 * The place's own details under its name: the address (a map link built HERE
 * from the address text — an owner-typed URL is never trusted), the phone (a
 * `tel:` link built from its digits), and today's hours with the week folded
 * under them. Each line is there only if the owner filled it in; a bare menu
 * with none of them is exactly the header it always was.
 */
function renderContacts(store: PublicMenuStore): string {
  const items: string[] = [];
  if (store.address) {
    const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
    items.push(
      `<li class="c-addr"><a href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer">${escapeHtml(store.address)}</a></li>`
    );
  }
  const tel = phoneHref(store.phone);
  if (store.phone && tel) {
    items.push(`<li class="c-phone"><a href="${escapeHtml(tel)}">${escapeHtml(store.phone)}</a></li>`);
  }
  if (store.hours_today) {
    if (store.hours.length > 1) {
      const week = store.hours
        .map((row) => `<li><span>${escapeHtml(row.days)}</span><b>${escapeHtml(row.text)}</b></li>`)
        .join('');
      items.push(
        `<li class="c-hours"><details><summary>Сьогодні ${escapeHtml(store.hours_today)}</summary><ul class="week">${week}</ul></details></li>`
      );
    } else {
      const only = store.hours[0];
      items.push(`<li class="c-hours">${escapeHtml(only ? `${only.days} ${only.text}` : `Сьогодні ${store.hours_today}`)}</li>`);
    }
  }
  return items.length ? `<ul class="contacts">${items.join('')}</ul>` : '';
}

export interface MenuPageOptions {
  /**
   * The QR carried this table's key and the owner lets guests read the bill:
   * the page gets a «Рахунок» bar and a sheet the script fills from `/bill`.
   * Never true without a table — the bill is a table's.
   */
  bill?: boolean;
  /**
   * Same proof, and the owner lets guests send dishes to a waiter (phase Q6):
   * every available dish gets an «Додати» button, and the page a cart and a
   * list of the guest's own requests. Never true without a table.
   */
  ordering?: boolean;
}

export function renderMenuPage(
  menu: PublicMenu,
  token: string,
  table: MenuTable | null = null,
  options: MenuPageOptions = {}
): string {
  const showBill = Boolean(options.bill && table);
  const ordering = Boolean(options.ordering && table);
  const tabs = menu.categories
    .map((c, i) => `<a href="#c-${c.id ?? 'other'}"${i === 0 ? ' class="on"' : ''}>${escapeHtml(c.name)}</a>`)
    .join('');
  const sections = menu.categories
    .map(
      (c) =>
        `<section class="cat" id="c-${c.id ?? 'other'}"><h2>${escapeHtml(c.name)}</h2>` +
        `<ul class="items">${c.products.map((p) => renderProduct(p, ordering)).join('')}</ul></section>`
    )
    .join('\n');
  const empty = menu.categories.length === 0 ? '<p class="empty">Меню поки порожнє.</p>' : '';
  const seat = table
    ? `<p class="at-table"><b>${escapeHtml(tableLabel(table.name))}</b> · ${escapeHtml(table.hall)}</p>`
    : '';
  // The size is in attributes, not a style: the page's CSP has no inline style.
  const logo = menu.store.logo_url
    ? `<img class="logo" src="${escapeHtml(menu.store.logo_url)}" width="56" height="56" alt="">`
    : '';
  const body = `<header class="top"><div class="brand">${logo}<div><h1>${escapeHtml(menu.store.name)}</h1><p class="sub">Меню</p></div></div>${seat}${renderContacts(menu.store)}</header>
${tabs ? `<nav class="tabs" aria-label="Розділи меню">${tabs}</nav>` : ''}
<main>
${empty}${sections}
</main>
<footer class="foot"><p>Стоп-лист і ціни оновлюються самі.</p><p><a href="${escapeHtml(publicBaseUrl())}/pos/kafe" rel="noopener">Меню працює на The Live Shop POS</a></p></footer>${showBill || ordering ? dockMarkup(table!, showBill, ordering) : ''}`;
  return shell(
    `${menu.store.name} — меню`,
    body,
    ` data-menu-url="/api/pos/public/menu/${escapeHtml(token)}" data-store-day="${escapeHtml(menu.store_day)}"` +
      (showBill ? ` data-bill-url="/api/pos/public/menu/${escapeHtml(token)}/bill"` : '') +
      (ordering ? ` data-order-url="/api/pos/public/menu/${escapeHtml(token)}/orders"` : '')
  );
}

/**
 * What is pinned to the bottom of the page and what opens over it. Only the
 * frames are server-rendered: the bill's lines come from `/bill` and the cart's
 * from the dishes the guest picked, and both are put in with `textContent`, so
 * nothing an owner typed is ever parsed as markup by the script. The table's
 * key is not here at all: the script reads it from the address bar, where the
 * QR put it.
 */
function dockMarkup(table: MenuTable, bill: boolean, ordering: boolean): string {
  const label = escapeHtml(tableLabel(table.name));
  const bars =
    (ordering ? '<button type="button" class="cart-bar" data-cart-open hidden></button>' : '') +
    (bill ? `<button type="button" class="bill-bar" data-bill-open>Рахунок · ${label}</button>` : '');
  const billSheet = bill
    ? `
<div class="bill-sheet" data-bill-sheet hidden role="dialog" aria-modal="true" aria-labelledby="bill-title">
<div class="bill-panel">
<header class="bill-head"><h2 id="bill-title">Рахунок · ${label}</h2><button type="button" class="bill-close" data-bill-close aria-label="Закрити">×</button></header>
<div class="bill-body" data-bill-body aria-live="polite"></div>
</div>
</div>`
    : '';
  const orderSheet = ordering
    ? `
<div class="bill-sheet" data-order-sheet hidden role="dialog" aria-modal="true" aria-labelledby="order-title">
<div class="bill-panel">
<header class="bill-head"><h2 id="order-title" data-order-title>Замовлення · ${label}</h2><button type="button" class="bill-close" data-order-close aria-label="Закрити">×</button></header>
<div class="bill-body" data-order-body aria-live="polite"></div>
<div class="order-foot" data-order-foot></div>
</div>
</div>`
    : '';
  return `\n<div class="dock">${bars}</div>${billSheet}${orderSheet}`;
}

// ── the QR card ─────────────────────────────────────────────────────

/** The QR as an inline SVG. Built from our own URL (a validated token on our own base), never from owner text. */
export function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
}

export interface PrintOptions {
  /**
   * The key printed in the table's QR — passed only when the request carried a
   * valid print link. Without it the QR still opens the menu with the table's
   * name on it, but the guest cannot read the bill.
   */
  key?: string;
  /** The owner lets guests read the bill, yet this page was opened without a print link. */
  missingKey?: boolean;
}

const MISSING_KEY_NOTICE =
  'Ця сторінка відкрита без ключа столу: QR відкриє меню, але не рахунок. Відкрийте її кнопкою «QR для всіх столів» у «Налаштуваннях» або в «Залах і столах».';

function notice(options: PrintOptions): string {
  return options.missingKey ? `<p class="notice">${escapeHtml(MISSING_KEY_NOTICE)}</p>` : '';
}

export function renderQrCard(
  storeName: string,
  token: string,
  table: MenuTable | null = null,
  options: PrintOptions = {}
): string {
  const url = table ? tableMenuUrl(token, table.id, options.key) : menuUrl(token);
  const seat = table
    ? `<p class="seat"><b>${escapeHtml(tableLabel(table.name))}</b><span>${escapeHtml(table.hall)}</span></p>`
    : '';
  const body = `${table ? notice(options) : ''}<main class="card">
<h1>${escapeHtml(storeName)}</h1>
${seat}<p class="lead">Скануйте — меню на телефоні</p>
<div class="qr">${qrSvg(url)}</div>
<p class="url">${escapeHtml(url.replace(/^https?:\/\//, ''))}</p>
<p class="hint">Ціни, розміри й те, що сьогодні закінчилось, — актуальні.</p>
<button type="button" class="print" data-print>Друкувати</button>
</main>`;
  return shell(`QR-меню — ${storeName}`, body, ' class="qr-page"');
}

/**
 * One sheet with a QR card for every table, ready to print and cut: the owner
 * lays out the room once and prints it once. Reachable by the same token as
 * the menu — the names of the tables are what is printed on the tables — and
 * it carries no bill, no seat count and no layout. The tables' KEYS go into
 * the QR codes only when the request brought a valid print link (`options.keys`).
 */
export function renderTablesSheet(
  storeName: string,
  token: string,
  tables: MenuTable[],
  options: PrintOptions & { keys?: Map<number, string> } = {}
): string {
  const cards = tables
    .map(
      (table) => `<article class="card table-card">
<h2>${escapeHtml(storeName)}</h2>
<p class="seat"><b>${escapeHtml(tableLabel(table.name))}</b><span>${escapeHtml(table.hall)}</span></p>
<div class="qr">${qrSvg(tableMenuUrl(token, table.id, options.keys?.get(table.id)))}</div>
<p class="hint">Скануйте — меню на телефоні</p>
</article>`
    )
    .join('\n');
  const body = `<header class="sheet-head">
<div><h1>QR для столів</h1><p>${escapeHtml(storeName)} · столів: ${tables.length}</p></div>
${tables.length ? '<button type="button" class="print" data-print>Друкувати</button>' : ''}
</header>
${tables.length ? notice(options) : ''}<main class="sheet">
${cards || '<p class="empty">Столів ще немає. Додайте зали й столи в розділі «Зали і столи» — і QR для кожного з’явиться тут.</p>'}
</main>`;
  return shell(`QR для столів — ${storeName}`, body, ' class="sheet-page"');
}

// ── nothing here ────────────────────────────────────────────────────

/**
 * The one answer for an unknown, disabled, rotated or malformed token — the
 * same page for all four, so it never tells a scanner which tokens exist.
 */
export function renderUnavailable(): string {
  return shell(
    'Меню недоступне',
    `<main class="gone"><h1>Меню недоступне</h1><p>Це посилання більше не діє. Попросіть актуальне меню в закладі.</p></main>`
  );
}
