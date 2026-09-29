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
import { deltaText, formatUahGuestCompact, groupHint } from './format.js';
import { menuUrl, publicBaseUrl, type PublicMenu, type PublicMenuProduct } from './menu.service.js';

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

function renderProduct(product: PublicMenuProduct): string {
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
    `<p class="price">${price}</p>${sizes}${groups}</div></li>`
  );
}

export function renderMenuPage(menu: PublicMenu, token: string): string {
  const tabs = menu.categories
    .map((c, i) => `<a href="#c-${c.id ?? 'other'}"${i === 0 ? ' class="on"' : ''}>${escapeHtml(c.name)}</a>`)
    .join('');
  const sections = menu.categories
    .map(
      (c) =>
        `<section class="cat" id="c-${c.id ?? 'other'}"><h2>${escapeHtml(c.name)}</h2>` +
        `<ul class="items">${c.products.map(renderProduct).join('')}</ul></section>`
    )
    .join('\n');
  const empty = menu.categories.length === 0 ? '<p class="empty">Меню поки порожнє.</p>' : '';
  const body = `<header class="top"><h1>${escapeHtml(menu.store.name)}</h1><p class="sub">Меню</p></header>
${tabs ? `<nav class="tabs" aria-label="Розділи меню">${tabs}</nav>` : ''}
<main>
${empty}${sections}
</main>
<footer class="foot"><p>Стоп-лист і ціни оновлюються самі.</p><p><a href="${escapeHtml(publicBaseUrl())}/pos/kafe" rel="noopener">Меню працює на The Live Shop POS</a></p></footer>`;
  return shell(
    `${menu.store.name} — меню`,
    body,
    ` data-menu-url="/api/pos/public/menu/${escapeHtml(token)}" data-store-day="${escapeHtml(menu.store_day)}"`
  );
}

// ── the QR card ─────────────────────────────────────────────────────

/** The QR as an inline SVG. Built from our own URL (a validated token on our own base), never from owner text. */
export function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
}

export function renderQrCard(storeName: string, token: string): string {
  const url = menuUrl(token);
  const body = `<main class="card">
<h1>${escapeHtml(storeName)}</h1>
<p class="lead">Скануйте — меню на телефоні</p>
<div class="qr">${qrSvg(url)}</div>
<p class="url">${escapeHtml(url.replace(/^https?:\/\//, ''))}</p>
<p class="hint">Ціни, розміри й те, що сьогодні закінчилось, — актуальні.</p>
<button type="button" class="print" data-print>Друкувати</button>
</main>`;
  return shell(`QR-меню — ${storeName}`, body, ' class="qr-page"');
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
